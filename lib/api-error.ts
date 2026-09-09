export class FeatureError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
