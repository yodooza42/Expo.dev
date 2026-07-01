declare module '@react-native-ml-kit/text-recognition' {
  interface TextRecognitionResult {
    text: string;
    blocks: unknown[];
  }
  interface TextRecognitionStatic {
    recognize(imageUri: string): Promise<TextRecognitionResult>;
  }
  const TextRecognition: TextRecognitionStatic;
  export default TextRecognition;
}
