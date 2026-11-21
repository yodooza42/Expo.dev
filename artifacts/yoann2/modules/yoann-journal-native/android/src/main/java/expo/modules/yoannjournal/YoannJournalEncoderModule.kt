package expo.modules.yoannjournal

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val TAG = "YoannJournalEncoder"
private const val MIME_TYPE = "video/avc"
private const val WIDTH = 720
private const val HEIGHT = 1280
private const val FPS = 15
private const val MAX_DURATION_SECONDS = 900
private const val MAX_PHOTOS = 500
private const val MAX_ENTRIES = 400
private const val MAX_OUTPUT_BYTES = 96L * 1024L * 1024L
private const val TARGET_OUTPUT_BYTES = 72L * 1024L * 1024L
private const val EOS_TIMEOUT_US = 10_000L

private class NativeExportCancelled : Exception("Création du carnet annulée.")
private class NativeExportFailure(message: String) : CodedException(message)

private data class NativeScene(
  val kind: String,
  val title: String,
  val subtitle: String,
  val dateLabel: String,
  val caption: String,
  val photoUris: List<String>,
  val photoSourceKey: String?,
  val lines: List<String>,
  val durationSec: Double,
)

private data class NativePlan(
  val title: String,
  val periodLabel: String,
  val projectNames: List<String>,
  val entryCount: Int,
  val photoCount: Int,
  val width: Int,
  val height: Int,
  val fps: Int,
  val maxBytes: Long,
  val scenes: List<NativeScene>,
)

private data class YuvFrame(
  val y: ByteArray,
  val u: ByteArray,
  val v: ByteArray,
)

private data class EncoderOutput(
  val file: File,
  val bytes: Long,
  val frames: Int,
  val durationMs: Long,
  val encoderName: String,
)

class YoannJournalEncoderModule : Module() {
  private val cancellations = ConcurrentHashMap<String, AtomicBoolean>()

  override fun definition() = ModuleDefinition {
    Name("YoannJournalEncoder")
    Events("onProgress")

    AsyncFunction("generate") Coroutine { jobId: String, rawPlan: Map<String, Any?> ->
      if (jobId.isBlank() || jobId.length > 100) {
        throw NativeExportFailure("Identifiant de création invalide.")
      }
      val context = appContext.reactContext
        ?: throw NativeExportFailure("L’application n’est plus disponible.")
      if (cancellations.containsKey(jobId)) {
        throw NativeExportFailure("Une création de ce carnet est déjà en cours.")
      }
      val cancellation = AtomicBoolean(false)
      cancellations[jobId] = cancellation
      try {
        val plan = parsePlan(rawPlan)
        val result = withContext(Dispatchers.IO) {
          NativeJournalVideoEncoder(context, jobId, plan, cancellation) { event ->
            sendEvent("onProgress", event)
          }.encode()
        }
        mapOf(
          "uri" to Uri.fromFile(result.file).toString(),
          "bytes" to result.bytes,
          "frames" to result.frames,
          "durationMs" to result.durationMs,
          "encoderName" to result.encoderName,
        )
      } finally {
        cancellations.remove(jobId)
      }
    }

    Function("cancel") { jobId: String ->
      cancellations[jobId]?.set(true)
    }

    OnDestroy {
      cancellations.values.forEach { it.set(true) }
      cancellations.clear()
    }
  }

  private fun parsePlan(raw: Map<String, Any?>): NativePlan {
    fun string(key: String): String = raw[key] as? String ?: ""
    fun integer(key: String): Int = (raw[key] as? Number)?.toInt() ?: 0
    val scenesRaw = raw["scenes"] as? List<*> ?: emptyList<Any?>()
    val scenes = scenesRaw.mapIndexed { index, value ->
      val scene = value as? Map<*, *>
        ?: throw NativeExportFailure("L’étape ${index + 1} du carnet est invalide.")
      fun sceneString(key: String): String = scene[key] as? String ?: ""
      val lines = (scene["lines"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
      val duration = (scene["durationSec"] as? Number)?.toDouble()
        ?: throw NativeExportFailure("La durée d’une étape du carnet est invalide.")
      if (!duration.isFinite() || duration <= 0.0) {
        throw NativeExportFailure("La durée d’une étape du carnet est invalide.")
      }
      val photoUri = sceneString("photoUri").takeIf { it.isNotBlank() }
      val photoFallbackUris = (scene["photoFallbackUris"] as? List<*>)
        ?.mapNotNull { it as? String }
        ?.filter { it.isNotBlank() }
        ?: emptyList()
      NativeScene(
        kind = sceneString("kind"),
        title = sceneString("title"),
        subtitle = sceneString("subtitle"),
        dateLabel = sceneString("dateLabel"),
        caption = sceneString("caption"),
        photoUris = (listOfNotNull(photoUri) + photoFallbackUris).distinct(),
        photoSourceKey = sceneString("photoSourceKey").takeIf { it.isNotBlank() },
        lines = lines,
        durationSec = duration,
      )
    }
    val projectNames = (raw["projectNames"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
    val plan = NativePlan(
      title = string("title"),
      periodLabel = string("periodLabel"),
      projectNames = projectNames,
      entryCount = integer("entryCount"),
      photoCount = integer("photoCount"),
      width = integer("width"),
      height = integer("height"),
      fps = integer("fps"),
      maxBytes = (raw["maxBytes"] as? Number)?.toLong() ?: MAX_OUTPUT_BYTES,
      scenes = scenes,
    )
    if (plan.width != WIDTH || plan.height != HEIGHT || plan.fps != FPS) {
      throw NativeExportFailure("Le format vidéo demandé n’est pas pris en charge.")
    }
    if (plan.entryCount !in 1..MAX_ENTRIES || plan.photoCount !in 0..MAX_PHOTOS ||
      plan.scenes.isEmpty() || plan.maxBytes !in 1..MAX_OUTPUT_BYTES
    ) {
      throw NativeExportFailure("La sélection dépasse la capacité du carnet.")
    }
    val timelinePhotoScenes = plan.scenes.filter { it.kind == "photo" && it.photoUris.isNotEmpty() }
    val timelinePhotoKeys = timelinePhotoScenes.map {
      it.photoSourceKey ?: it.photoUris.first()
    }.toSet()
    val newComparisonPhotoKeys = plan.scenes
      .filter { it.kind == "comparison" && it.photoUris.isNotEmpty() }
      .map { it.photoSourceKey ?: it.photoUris.first() }
      .filterNot { it in timelinePhotoKeys }
      .toSet()
    if (timelinePhotoScenes.size + newComparisonPhotoKeys.size != plan.photoCount) {
      throw NativeExportFailure("Le nombre de photos ne correspond pas au carnet.")
    }
    val duration = plan.scenes.sumOf { it.durationSec }
    if (!duration.isFinite() || duration > MAX_DURATION_SECONDS) {
      throw NativeExportFailure("Ce carnet dépasse 15 minutes.")
    }
    if (plan.scenes.any { (it.kind == "photo" || it.kind == "comparison") && it.photoUris.isEmpty() }) {
      throw NativeExportFailure("Une photo du carnet est introuvable.")
    }
    return plan
  }
}

private class NativeJournalVideoEncoder(
  private val context: android.content.Context,
  private val jobId: String,
  private val plan: NativePlan,
  private val cancellation: AtomicBoolean,
  private val emitProgress: (Map<String, Any>) -> Unit,
) {
  private var codec: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var muxerStarted = false
  private var trackIndex = -1
  private var outputBytes = 0L
  private val output = File(context.cacheDir, "journal_${jobId}.partial.mp4")

  fun encode(): EncoderOutput {
    val duration = plan.scenes.sumOf { it.durationSec }
    val estimatedFrames = plan.scenes.sumOf { max(1, (it.durationSec * FPS).roundToInt()) }
    val requiredFreeBytes = MAX_OUTPUT_BYTES + 16L * 1024L * 1024L
    if (StatFs(context.cacheDir.path).availableBytes < requiredFreeBytes) {
      throw NativeExportFailure("Il faut au moins 112 Mo libres pour créer ce carnet en sécurité.")
    }
    emit("preparing", 0, 0, estimatedFrames, 0)

    try {
      output.delete()
      val encoderInfo = selectEncoder()
      val format = MediaFormat.createVideoFormat(MIME_TYPE, WIDTH, HEIGHT).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        setInteger(MediaFormat.KEY_BIT_RATE, bitrateFor(duration))
        setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
        }
      }
      codec = MediaCodec.createByCodecName(encoderInfo.name).also {
        it.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        it.start()
      }
      muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

      var frameIndex = 0
      var presentationTimeUs = 0L
      plan.scenes.forEachIndexed { sceneIndex, scene ->
        checkCancelled()
        val frame = renderScene(scene)
        val repeats = max(1, (scene.durationSec * FPS).roundToInt())
        try {
          repeat(repeats) {
            checkCancelled()
            submitFrame(frame, presentationTimeUs)
            presentationTimeUs += 1_000_000L / FPS
            frameIndex++
            drainEncoder(endOfStream = false)
            if (output.length() > plan.maxBytes) {
              throw NativeExportFailure("La vidéo dépasserait 96 Mo. Réduis la durée ou le nombre de photos.")
            }
            if (frameIndex % FPS == 0 || frameIndex == estimatedFrames) {
              emit("encoding", sceneIndex + 1, frameIndex, estimatedFrames, output.length())
            }
          }
        } finally {
          frame.y.fill(0)
          frame.u.fill(0)
          frame.v.fill(0)
        }
      }

      signalEndOfStream(presentationTimeUs)
      drainEncoder(endOfStream = true)
      val finishedMuxer = muxer ?: throw NativeExportFailure("Le fichier MP4 n’a pas pu être finalisé.")
      if (!muxerStarted || !output.isFile || output.length() <= 0L) {
        throw NativeExportFailure("Le fichier MP4 est incomplet.")
      }
      finishedMuxer.stop()
      finishedMuxer.release()
      muxer = null
      muxerStarted = false

      if (output.length() > plan.maxBytes) {
        throw NativeExportFailure("La vidéo dépasserait 96 Mo. Réduis la durée ou le nombre de photos.")
      }
      val finalFile = File(context.cacheDir, "journal_${jobId}.mp4")
      if (finalFile.exists() && !finalFile.delete()) {
        throw NativeExportFailure("Impossible de préparer le fichier vidéo final.")
      }
      if (!output.renameTo(finalFile)) {
        throw NativeExportFailure("Impossible de finaliser le fichier vidéo.")
      }
      emit("finalizing", plan.scenes.size, frameIndex, estimatedFrames, finalFile.length())
      return EncoderOutput(finalFile, finalFile.length(), frameIndex, presentationTimeUs / 1000L, encoderInfo.name)
    } catch (error: Throwable) {
      output.delete()
      if (error is NativeExportCancelled || error is NativeExportFailure) throw error
      Log.e(TAG, "Native journal export failed", error)
      throw NativeExportFailure("La création vidéo Android a échoué. Le brouillon et les photos sont conservés.")
    } finally {
      runCatching { codec?.stop() }
      runCatching { codec?.release() }
      codec = null
      runCatching {
        if (muxerStarted) muxer?.stop()
      }
      runCatching { muxer?.release() }
      muxer = null
      muxerStarted = false
    }
  }

  private fun selectEncoder(): MediaCodecInfo {
    val candidates = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
      .filter { info ->
        info.isEncoder && info.supportedTypes.any { it.equals(MIME_TYPE, ignoreCase = true) }
          && runCatching {
            info.getCapabilitiesForType(MIME_TYPE).colorFormats.contains(
              MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
            )
          }.getOrDefault(false)
      }
    val hardware = candidates.firstOrNull { info ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) info.isHardwareAccelerated
      else !info.name.startsWith("OMX.google.", true) && !info.name.startsWith("c2.android.", true)
    }
    return hardware ?: candidates.firstOrNull()
      ?: throw NativeExportFailure("Aucun encodeur MP4 compatible n’est disponible sur cet appareil.")
  }

  private fun bitrateFor(durationSec: Double): Int {
    val desired = TARGET_OUTPUT_BYTES.toDouble() * 8.0 / max(1.0, durationSec)
    return desired.roundToInt().coerceIn(500_000, 4_000_000)
  }

  private fun submitFrame(frame: YuvFrame, presentationTimeUs: Long) {
    val activeCodec = codec ?: throw NativeExportFailure("L’encodeur vidéo n’est plus disponible.")
    val inputIndex = activeCodec.dequeueInputBuffer(EOS_TIMEOUT_US)
    if (inputIndex < 0) throw NativeExportFailure("L’encodeur vidéo ne reçoit plus d’images.")
    val image = activeCodec.getInputImage(inputIndex)
      ?: throw NativeExportFailure("L’encodeur Android ne prend pas en charge ce format d’image.")
    try {
      copyYuvToImage(frame, image)
      activeCodec.queueInputBuffer(inputIndex, 0, 0, presentationTimeUs, 0)
    } finally {
      image.close()
    }
  }

  private fun signalEndOfStream(presentationTimeUs: Long) {
    val activeCodec = codec ?: return
    val inputIndex = activeCodec.dequeueInputBuffer(EOS_TIMEOUT_US)
    if (inputIndex < 0) throw NativeExportFailure("L’encodeur n’a pas pu terminer la vidéo.")
    activeCodec.queueInputBuffer(
      inputIndex, 0, 0, presentationTimeUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM,
    )
  }

  private fun drainEncoder(endOfStream: Boolean) {
    val activeCodec = codec ?: return
    val info = MediaCodec.BufferInfo()
    var sawEndOfStream = false
    var idlePolls = 0
    while (!sawEndOfStream) {
      val outputIndex = activeCodec.dequeueOutputBuffer(info, if (endOfStream) EOS_TIMEOUT_US else 0L)
      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return
          idlePolls++
          if (idlePolls > 500) throw NativeExportFailure("L’encodeur n’a pas terminé dans le délai prévu.")
        }
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (muxerStarted) throw NativeExportFailure("Le format vidéo a changé pendant l’export.")
          val activeMuxer = muxer ?: throw NativeExportFailure("Le fichier MP4 n’est pas disponible.")
          trackIndex = activeMuxer.addTrack(activeCodec.outputFormat)
          activeMuxer.start()
          muxerStarted = true
        }
        outputIndex >= 0 -> {
          val buffer = activeCodec.getOutputBuffer(outputIndex)
          if (buffer != null && info.size > 0) {
            if (!muxerStarted) {
              activeCodec.releaseOutputBuffer(outputIndex, false)
              throw NativeExportFailure("L’encodeur n’a pas fourni les informations du MP4.")
            }
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            muxer?.writeSampleData(trackIndex, buffer, info)
            outputBytes += info.size
            if (outputBytes > plan.maxBytes) {
              activeCodec.releaseOutputBuffer(outputIndex, false)
              throw NativeExportFailure("La vidéo dépasserait 96 Mo. Réduis la durée ou le nombre de photos.")
            }
          }
          sawEndOfStream = (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
          activeCodec.releaseOutputBuffer(outputIndex, false)
        }
      }
      checkCancelled()
    }
  }

  private fun renderScene(scene: NativeScene): YuvFrame {
    val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val ink = Color.rgb(33, 43, 66)
    val muted = Color.rgb(86, 96, 118)
    val accent = Color.rgb(185, 65, 79)
    val paper = Color.rgb(242, 239, 229)
    canvas.drawColor(paper)
    val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(30, 86, 124, 165)
      strokeWidth = 1f
    }
    var x = 24f
    while (x < WIDTH) { canvas.drawLine(x, 0f, x, HEIGHT.toFloat(), grid); x += 32f }
    var y = 24f
    while (y < HEIGHT) { canvas.drawLine(0f, y, WIDTH.toFloat(), y, grid); y += 32f }
    val margin = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(115, 185, 65, 79); strokeWidth = 2f }
    canvas.drawLine(70f, 0f, 70f, HEIGHT.toFloat(), margin)

    val kicker = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = accent
      textSize = 23f
      typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
    }
    canvas.drawText(
      when (scene.kind) {
        "intro" -> "CARNET DE BORD"
        "recap" -> "UNE ÉTAPE APRÈS L’AUTRE"
        "comparison" -> "AVANT / APRÈS"
        "outro" -> "SOUVENIRS ET RÉALISATIONS"
        else -> scene.dateLabel.uppercase()
      },
      100f, 112f, kicker,
    )

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = ink
      textSize = if (scene.kind == "intro") 36f else 32f
      typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD)
    }
    drawWrapped(canvas, scene.title.ifBlank { "Carnet de bord" }, titlePaint, 100f, 190f, 500f, 4, 1.16f)

    if (scene.subtitle.isNotBlank()) {
      val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = muted
        textSize = 22f
        typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.ITALIC)
      }
      drawWrapped(canvas, scene.subtitle, subPaint, 100f, 350f, 500f, 2, 1.2f)
    }

    scene.photoUris.takeIf { it.isNotEmpty() }?.let { uris ->
      val photo = decodePhoto(uris)
      try {
      val photoArea = RectF(90f, 390f, 630f, 850f)
        val scale = min(photoArea.width() / photo.width, photoArea.height() / photo.height)
        val photoWidth = photo.width * scale
        val photoHeight = photo.height * scale
        val destination = RectF(
          photoArea.centerX() - photoWidth / 2f,
          photoArea.centerY() - photoHeight / 2f,
          photoArea.centerX() + photoWidth / 2f,
          photoArea.centerY() + photoHeight / 2f,
        )
        val border = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
        canvas.drawRoundRect(RectF(destination).apply { inset(-8f, -8f) }, 12f, 12f, border)
        canvas.drawBitmap(photo, null, destination, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
      } finally {
        photo.recycle()
      }
    }

    val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = ink
      textSize = 25f
      typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.NORMAL)
    }
    when (scene.kind) {
      "recap" -> {
        if (scene.lines.size > 6) {
          throw NativeExportFailure("Une page récapitulative contient trop d’étapes.")
        }
        val recapPaint = Paint(bodyPaint).apply { textSize = 20f }
        var lineY = 490f
        scene.lines.forEach { text ->
          drawWrapped(canvas, "• $text", recapPaint, 100f, lineY, 500f, 2, 1.2f)
          lineY += 95f
        }
      }
      "intro" -> {
        drawWrapped(canvas, scene.caption, bodyPaint, 100f, 510f, 500f, 8, 1.25f)
      }
      "outro" -> drawWrapped(canvas, scene.caption, bodyPaint, 100f, 510f, 500f, 8, 1.25f)
      "entry" -> if (scene.caption.isNotBlank()) {
        drawWrapped(canvas, scene.caption, bodyPaint, 100f, 510f, 500f, 12, 1.2f)
      }
      else -> if (scene.caption.isNotBlank()) {
        drawWrapped(canvas, scene.caption, bodyPaint, 100f, 900f, 500f, 8, 1.2f)
      }
    }
    val footer = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = muted
      textSize = 18f
      typeface = android.graphics.Typeface.create("monospace", android.graphics.Typeface.NORMAL)
    }
    canvas.drawText("CARNET DE BORD", 100f, 1210f, footer)
    val frame = bitmapToYuv(bitmap)
    bitmap.recycle()
    return frame
  }

  private fun drawWrapped(
    canvas: Canvas,
    text: String,
    paint: Paint,
    x: Float,
    y: Float,
    maxWidth: Float,
    maxLines: Int,
    lineSpacing: Float,
  ) {
    val words = text.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (words.isEmpty()) return
    val lines = mutableListOf<String>()
    var current = ""
    for (word in words) {
      if (paint.measureText(word) > maxWidth) {
        throw NativeExportFailure("Un mot du carnet est trop long pour être affiché sans le couper.")
      }
      val candidate = if (current.isEmpty()) word else "$current $word"
      if (paint.measureText(candidate) <= maxWidth) current = candidate
      else { lines.add(current); current = word }
    }
    if (current.isNotEmpty()) lines.add(current)
    if (lines.size > maxLines) {
      throw NativeExportFailure("Un texte du carnet est trop long pour être affiché sans le couper.")
    }
    lines.forEachIndexed { index, line ->
      canvas.drawText(line, x, y + index * paint.textSize * lineSpacing, paint)
    }
  }

  private fun decodePhoto(uriCandidates: List<String>): Bitmap {
    for (uri in uriCandidates.distinct()) {
      try {
        return decodePhotoCandidate(uri)
      } catch (error: Exception) {
        Log.w(TAG, "Could not read a native journal photo candidate", error)
      }
    }
    throw NativeExportFailure(
      "Une photo du carnet est illisible ou son accès a expiré. Vérifie son accès puis réessaie.",
    )
  }

  private fun decodePhotoCandidate(uriString: String): Bitmap {
    val uri = Uri.parse(uriString)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openPhoto(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw NativeExportFailure("Une photo du carnet est illisible.")
    }
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 1600) sample *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    var decoded = openPhoto(uri).use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw NativeExportFailure("Une photo du carnet est illisible.")
    val orientation = runCatching {
      openPhoto(uri).use { ExifInterface(it).getAttributeInt(
        ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL,
      ) }
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(270f); matrix.postScale(-1f, 1f) }
    }
    if (!matrix.isIdentity) {
      val oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      if (oriented !== decoded) decoded.recycle()
      decoded = oriented
    }
    val scale = min(1f, min(1280f / decoded.width, 1280f / decoded.height))
    if (scale < 1f) {
      val resized = Bitmap.createScaledBitmap(
        decoded, max(1, (decoded.width * scale).roundToInt()),
        max(1, (decoded.height * scale).roundToInt()), true,
      )
      if (resized !== decoded) decoded.recycle()
      decoded = resized
    }
    return decoded
  }

  private fun openPhoto(uri: Uri): InputStream {
    if (uri.scheme == "content" || uri.scheme == "android.resource") {
      return context.contentResolver.openInputStream(uri)
        ?: throw NativeExportFailure("L’accès à une photo du carnet a expiré.")
    }
    val path = when (uri.scheme) {
      "file" -> uri.path
      null -> uri.toString()
      else -> null
    } ?: throw NativeExportFailure("Le format d’une photo du carnet n’est pas pris en charge.")
    return File(path).inputStream()
  }

  private fun bitmapToYuv(bitmap: Bitmap): YuvFrame {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val y = ByteArray(width * height)
    val u = ByteArray(width / 2 * (height / 2))
    val v = ByteArray(width / 2 * (height / 2))
    for (row in 0 until height) {
      for (column in 0 until width) {
        val color = pixels[row * width + column]
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        y[row * width + column] = (((66 * red + 129 * green + 25 * blue + 128) shr 8) + 16)
          .coerceIn(0, 255).toByte()
      }
    }
    for (row in 0 until height step 2) {
      for (column in 0 until width step 2) {
        var red = 0; var green = 0; var blue = 0
        for (dy in 0..1) for (dx in 0..1) {
          val color = pixels[(row + dy) * width + column + dx]
          red += Color.red(color); green += Color.green(color); blue += Color.blue(color)
        }
        red /= 4; green /= 4; blue /= 4
        val index = (row / 2) * (width / 2) + column / 2
        u[index] = (((-38 * red - 74 * green + 112 * blue + 128) shr 8) + 128)
          .coerceIn(0, 255).toByte()
        v[index] = (((112 * red - 94 * green - 18 * blue + 128) shr 8) + 128)
          .coerceIn(0, 255).toByte()
      }
    }
    pixels.fill(0)
    return YuvFrame(y, u, v)
  }

  private fun copyYuvToImage(frame: YuvFrame, image: android.media.Image) {
    val planes = image.planes
    if (planes.size < 3 || image.width != WIDTH || image.height != HEIGHT) {
      throw NativeExportFailure("L’encodeur Android a renvoyé un format d’image inattendu.")
    }
    copyPlane(frame.y, WIDTH, HEIGHT, planes[0])
    copyPlane(frame.u, WIDTH / 2, HEIGHT / 2, planes[1])
    copyPlane(frame.v, WIDTH / 2, HEIGHT / 2, planes[2])
  }

  private fun copyPlane(source: ByteArray, width: Int, height: Int, plane: android.media.Image.Plane) {
    val buffer = plane.buffer
    val base = buffer.position()
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    for (row in 0 until height) {
      var sourceIndex = row * width
      var targetIndex = base + row * rowStride
      for (column in 0 until width) {
        buffer.put(targetIndex, source[sourceIndex])
        sourceIndex++
        targetIndex += pixelStride
      }
    }
  }

  private fun emit(stage: String, scene: Int, frames: Int, totalFrames: Int, bytes: Long) {
    val percent = if (totalFrames <= 0) 0 else min(99, (frames * 100) / totalFrames)
    emitProgress(mapOf(
      "jobId" to jobId,
      "stage" to stage,
      "progress" to percent,
      "scene" to scene,
      "scenes" to plan.scenes.size,
      "frames" to frames,
      "totalFrames" to totalFrames,
      "bytes" to bytes,
    ))
  }

  private fun checkCancelled() {
    if (cancellation.get() || Thread.currentThread().isInterrupted) throw NativeExportCancelled()
  }
}
