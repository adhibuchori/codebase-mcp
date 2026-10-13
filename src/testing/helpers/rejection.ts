/**
 * The error a promise rejects with. bun-types declares the `expect(promise).rejects` matchers as
 * returning void, so awaiting them trips the type-aware await-thenable rule; tests await this
 * instead and assert on the error it returns.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('Expected the promise to reject, but it resolved.');
}
