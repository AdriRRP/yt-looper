import {
  applyStorageMutation,
  isStorageMutationRequest,
  type StorageMutationResult,
  type StorageMutationResponse
} from "../platform/storage-coordinator";

const MAX_REMEMBERED_REQUESTS = 512;
interface ProcessedRequest {
  fingerprint: string;
  promise: Promise<StorageMutationResult>;
}

const processedRequests = new Map<string, ProcessedRequest>();

interface RuntimeApi {
  onMessage?: {
    addListener(
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response: StorageMutationResponse) => void
      ) => boolean | undefined
    ): void;
  };
}

interface ExtensionApi {
  runtime?: RuntimeApi;
}

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
};
const runtime = extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime;

function coordinatedMutation(
  requestId: string,
  mutation: Parameters<typeof applyStorageMutation>[0]
): Promise<StorageMutationResult> {
  const existing = processedRequests.get(requestId);
  if (existing) {
    if (existing.fingerprint !== JSON.stringify(mutation)) {
      return Promise.reject(new Error("A storage request id was reused for a different mutation."));
    }
    return existing.promise;
  }
  const operation = applyStorageMutation(mutation, requestId);
  processedRequests.set(requestId, { fingerprint: JSON.stringify(mutation), promise: operation });
  if (processedRequests.size > MAX_REMEMBERED_REQUESTS) {
    const oldest = processedRequests.keys().next().value;
    if (oldest) {
      processedRequests.delete(oldest);
    }
  }
  return operation;
}

runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (!isStorageMutationRequest(message)) {
    return false;
  }
  const requestId = message.requestId ?? crypto.randomUUID();
  void coordinatedMutation(requestId, message.mutation).then(
    (result) => sendResponse({ ok: true, result }),
    (error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown storage mutation error."
      })
  );
  return true;
});
