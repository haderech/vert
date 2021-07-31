export default function assert(condition, message = '') {
  if (!condition) {
    const error = new Error();
    error.message = message;
    throw error;
  }
}
