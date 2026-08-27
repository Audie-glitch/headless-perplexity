"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "plex.cookies";
const LEGACY_KEY = "plex.session";
const CHANGE_EVENT = "plex-cookies";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readPersisted(): string {
  return sessionStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(LEGACY_KEY) ?? "";
}

function writePersisted(value: string) {
  if (value.trim()) {
    sessionStorage.setItem(STORAGE_KEY, value);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_KEY);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useCookieJar() {
  const persisted = useSyncExternalStore(subscribe, readPersisted, () => "");
  const [draft, setDraft] = useState<string | null>(null);
  const cookieJar = draft ?? persisted;

  const persist = useCallback(() => {
    writePersisted(cookieJar);
    setDraft(null);
  }, [cookieJar]);

  const persistValue = useCallback((value: string) => {
    writePersisted(value.trim());
    setDraft(null);
  }, []);

  return { cookieJar, setCookieJar: setDraft, persist, persistValue };
}

const EMAILNATOR_KEY = "plex.emailnator";
const EMAILNATOR_EVENT = "plex-emailnator";

function subscribeEmailnator(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EMAILNATOR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EMAILNATOR_EVENT, onChange);
  };
}

function readEmailnator(): string {
  return sessionStorage.getItem(EMAILNATOR_KEY) ?? "";
}

function writeEmailnator(value: string) {
  if (value.trim()) {
    sessionStorage.setItem(EMAILNATOR_KEY, value.trim());
  } else {
    sessionStorage.removeItem(EMAILNATOR_KEY);
  }
  window.dispatchEvent(new Event(EMAILNATOR_EVENT));
}

export function useEmailnatorJar() {
  const persisted = useSyncExternalStore(subscribeEmailnator, readEmailnator, () => "");
  const [draft, setDraft] = useState<string | null>(null);
  const emailnatorCookies = draft ?? persisted;

  const persistEmailnator = useCallback(() => {
    writeEmailnator(emailnatorCookies);
    setDraft(null);
  }, [emailnatorCookies]);

  return { emailnatorCookies, setEmailnatorCookies: setDraft, persistEmailnator };
}
