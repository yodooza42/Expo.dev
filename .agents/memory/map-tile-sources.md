---
name: Map tile sources
description: Reliable no-key raster map basemaps and attribution for Yoann2 mobile maps.
---

CARTO's public basemap URLs return an `API KEY REQUIRED` tile in the Android map. The standard OpenStreetMap tile endpoint was blocked in the current Replit environment. ArcGIS World Street Map and World Imagery tile endpoints returned image data without an API key.

**Why:** The map is rendered in Leaflet inside a native WebView, and a missing tile provider key makes the route disappear even though the app and GPS data continue to work. ArcGIS service metadata provides the required copyright credits.

**How to apply:** When changing Yoann2 basemaps, verify a real tile response from the provider and keep its service attribution visible in Leaflet. ArcGIS tile paths use `{z}/{y}/{x}` ordering; apply night styling only to the raster tile pane so routes and markers retain their colors.