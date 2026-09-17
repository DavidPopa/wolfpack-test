"use client";

import type { MessageHistoryResponse } from "@map-chat/contracts";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData
} from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { type AuthSessionState } from "@/lib/auth-session";
import {
  createMessage,
  generateMessageClientRequestId,
  messageCreateAttemptsQueryKey,
  messageDraftsQueryKey,
  MessageCreateError,
  normalizeMessageBody,
  upsertCanonicalMessage,
  type MessageCreateAttempt,
  type MessageCreateInput
} from "@/lib/message-create";
import { messageHistoryQueryKey } from "@/lib/message-history";
import { Button } from "./ui/button";

type MessageComposerProps = {
  roomId: string;
  auth: AuthSessionState;
  onSignIn: () => Promise<void>;
  generateClientRequestId?: () => string;
};

const canRestart = (attempt: MessageCreateAttempt) =>
  attempt.error?.kind !== "room-not-found";

export function MessageComposer({
  roomId,
  auth,
  onSignIn,
  generateClientRequestId = generateMessageClientRequestId
}: MessageComposerProps) {
  const queryClient = useQueryClient();
  const attemptsQuery = useQuery<MessageCreateAttempt[]>({
    queryKey: messageCreateAttemptsQueryKey,
    queryFn: async () => [],
    initialData: [],
    retry: false,
    staleTime: Infinity
  });
  const draftsQuery = useQuery<Record<string, string>>({
    queryKey: messageDraftsQueryKey,
    queryFn: async () => ({}),
    initialData: {},
    retry: false,
    staleTime: Infinity
  });
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [sentByRoom, setSentByRoom] = useState<Record<string, string>>({});
  const [signInPending, setSignInPending] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attempts = useMemo(
    () => attemptsQuery.data.filter((attempt) => attempt.roomId === roomId),
    [attemptsQuery.data, roomId]
  );
  const draft = draftsQuery.data[roomId] ?? "";

  const setDraft = (value: string) => {
    queryClient.setQueryData<Record<string, string>>(messageDraftsQueryKey, (current) => ({
      ...(current ?? {}),
      [roomId]: value
    }));
  };

  const mutation = useMutation({
    mutationFn: createMessage,
    retry: false,
    onSuccess(result, variables) {
      const historyKey = messageHistoryQueryKey(variables.roomId);
      const existing = queryClient.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(historyKey);
      if (existing) {
        queryClient.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(historyKey, (current) =>
          current ? upsertCanonicalMessage(current, result.message) : current
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: historyKey, exact: true });
      }
      queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
        (current ?? []).filter((attempt) => attempt.clientRequestId !== variables.clientRequestId)
      );
      setSentByRoom((current) => ({ ...current, [variables.roomId]: "Message sent." }));
    },
    onError(error, variables) {
      const failure = error instanceof MessageCreateError
        ? error.failure
        : {
            kind: "unexpected" as const,
            message: "Message sending returned an unexpected response. Please start a new attempt.",
            retryable: false
          };
      queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
        (current ?? []).map((attempt) => attempt.clientRequestId === variables.clientRequestId
          ? { ...attempt, status: "failed" as const, error: failure }
          : attempt)
      );
    }
  });

  const send = (attempt: MessageCreateAttempt) => {
    const input: MessageCreateInput = {
      roomId: attempt.roomId,
      body: attempt.body,
      clientRequestId: attempt.clientRequestId
    };
    mutation.mutate(input);
  };

  const makeAttempt = (body: string): MessageCreateAttempt | null => {
    if (auth.status !== "signed-in") return null;
    return {
      roomId,
      body,
      clientRequestId: generateClientRequestId(),
      author: {
        name: auth.session.user.name || "Google user",
        image: auth.session.user.image ?? null
      },
      status: "pending"
    };
  };

  const startNewAttempt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (auth.status !== "signed-in") return;

    let body: string;
    try {
      body = normalizeMessageBody(draft);
    } catch {
      setValidationMessage("Enter a message between 1 and 1000 characters.");
      return;
    }

    const currentAttempts = queryClient.getQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey) ?? [];
    if (currentAttempts.some((attempt) =>
      attempt.roomId === roomId && attempt.body === body && attempt.status === "pending"
    )) {
      setValidationMessage("That message is already being sent.");
      return;
    }

    const attempt = makeAttempt(body);
    if (!attempt) return;
    queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) => [
      ...(current ?? []),
      attempt
    ]);
    setDraft("");
    setValidationMessage(null);
    setSentByRoom((current) => ({ ...current, [roomId]: "" }));
    send(attempt);
  };

  const retryAttempt = (attempt: MessageCreateAttempt) => {
    if (auth.status !== "signed-in" || !attempt.error?.retryable) return;
    const pending: MessageCreateAttempt = {
      roomId: attempt.roomId,
      body: attempt.body,
      clientRequestId: attempt.clientRequestId,
      author: attempt.author,
      status: "pending"
    };
    queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
      (current ?? []).map((candidate) => candidate.clientRequestId === attempt.clientRequestId ? pending : candidate)
    );
    send(pending);
  };

  const restartAttempt = (attempt: MessageCreateAttempt) => {
    if (auth.status !== "signed-in" || !canRestart(attempt)) return;
    const replacement = makeAttempt(attempt.body);
    if (!replacement) return;
    queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
      (current ?? []).map((candidate) => candidate.clientRequestId === attempt.clientRequestId ? replacement : candidate)
    );
    send(replacement);
  };

  const editAttempt = (attempt: MessageCreateAttempt) => {
    setDraft(attempt.body);
    queryClient.setQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey, (current) =>
      (current ?? []).filter((candidate) => candidate.clientRequestId !== attempt.clientRequestId)
    );
    setValidationMessage(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const beginSignIn = async () => {
    setSignInPending(true);
    setSignInError(null);
    try {
      await onSignIn();
    } catch {
      setSignInError("Google sign-in could not be started. Please try again.");
    } finally {
      setSignInPending(false);
    }
  };

  return <section className="message-composer" aria-label="Message composer">
    {attempts.length > 0 && <div className="message-attempts" aria-label="Message sending attempts">
      {attempts.map((attempt) => <article className={`message-attempt message-attempt--${attempt.status}`} key={attempt.clientRequestId}>
        <header><strong>{attempt.author.name}</strong><span>{attempt.status === "pending" ? "Sending…" : "Not sent"}</span></header>
        <p>{attempt.body}</p>
        {attempt.status === "pending" && <p className="message-attempt__status" role="status">Waiting for server confirmation.</p>}
        {attempt.status === "failed" && <div className="message-attempt__error" role="alert">
          <p>{attempt.error?.message ?? "This message was not sent."}</p>
          {attempt.error?.retryable && auth.status === "signed-in" && <Button type="button" onClick={() => retryAttempt(attempt)}>Retry sending message</Button>}
          {!attempt.error?.retryable && canRestart(attempt) && auth.status === "signed-in" && <Button type="button" onClick={() => restartAttempt(attempt)}>Start a new attempt</Button>}
          {auth.status === "signed-in" && <Button type="button" variant="secondary" onClick={() => editAttempt(attempt)}>Edit message</Button>}
        </div>}
      </article>)}
    </div>}

    {sentByRoom[roomId] && <p className="message-composer__sent" role="status" aria-live="polite" aria-atomic="true">{sentByRoom[roomId]}</p>}

    {auth.status === "loading" && <p role="status">Checking whether you can send messages…</p>}
    {auth.status === "error" && <div className="message-composer__auth-error" role="alert">
      <p>We could not check your session. Public history is still available.</p>
      <Button type="button" variant="secondary" onClick={() => void auth.retry()}>Retry session check</Button>
    </div>}
    {auth.status === "signed-out" && <div className="message-composer__guest">
      <p>Sign in with Google to send a message. Public history remains available.</p>
      <Button type="button" disabled={signInPending} onClick={() => void beginSignIn()}>
        {signInPending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {signInError && <p role="alert">{signInError}</p>}
    </div>}
    {auth.status === "signed-in" && <form className="message-composer__form" onSubmit={startNewAttempt}>
      <label htmlFor={`message-body-${roomId}`}>Message</label>
      <textarea
        ref={inputRef}
        id={`message-body-${roomId}`}
        value={draft}
        rows={3}
        maxLength={1000}
        aria-describedby={`message-help-${roomId}${validationMessage ? ` message-error-${roomId}` : ""}`}
        onChange={(event) => {
          setDraft(event.target.value);
          setValidationMessage(null);
        }}
      />
      <p id={`message-help-${roomId}`} className="message-composer__help">Plain text, up to 1000 characters.</p>
      {validationMessage && <p id={`message-error-${roomId}`} className="message-composer__validation" role="alert">{validationMessage}</p>}
      <Button type="submit">Send message</Button>
    </form>}
  </section>;
}
