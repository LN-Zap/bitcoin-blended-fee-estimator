import config from "config";
import { logger } from "./logger";

export const TIMEOUT = config.get<number>("settings.timeout");
export const LOGLEVEL = config.get<string>("settings.loglevel");

const log = logger(LOGLEVEL, "util");

/**
 * Fetches a resource from a URL with a timeout.
 *
 * @param url - The URL of the resource to fetch.
 * @param timeout - The maximum time (in milliseconds) to wait for the fetch to complete. Defaults to `TIMEOUT`.
 * @returns A promise that resolves to the fetched resource.
 *
 * @throws Will throw an error if the fetch request times out.
 *
 * @remarks Note: fetch signal abortcontroller does not work on Bun.
 * See {@link https://github.com/oven-sh/bun/issues/2489}
 */
export async function fetchWithTimeout(
  url: string,
  timeout: number = TIMEOUT,
): Promise<Response> {
  log.debug({ message: `Starting fetch request to "${url}"` });
  const fetchPromise = fetch(url);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Request timed out after ${timeout} ms`)),
      timeout,
    ),
  );

  return Promise.race([fetchPromise, timeoutPromise]) as Promise<Response>;
}

/**
 * Fetches data from a specific URL with a specified response type and timeout.
 *
 * This function uses the `fetchWithTimeout` function to fetch data from the given URL.
 * If the response is not OK (status code is not in the range 200-299), it throws an error.
 * Depending on the `responseType` parameter, it either parses the response as JSON or as text.
 *
 * @param url - The URL to fetch data from.
 * @param responseType - The expected type of the response ('json' or 'text').
 * @param timeout - The maximum time (in milliseconds) to wait for the fetch to complete.
 * @returns A promise that resolves to the fetched data.
 *
 * @throws Will throw an error if the fetch request times out, or if the response status is not OK.
 */
export async function fetchData<T>(
  url: string,
  responseType: ExpectedResponseType,
  timeout: number,
): Promise<T> {
  try {
    const response = await fetchWithTimeout(url, timeout);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await (responseType === "json"
      ? response.json()
      : response.text());
    return data as T;
  } catch (error) {
    log.error({ msg: `Error fetching data from "${url}":`, error });
    throw error;
  }
}
