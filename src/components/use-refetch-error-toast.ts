"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/toast";
import { errorMessage, isMissingResource, isUnauthorized } from "@/lib/api-client";

/**
 * When a background refetch fails but data is still on screen, keep showing the data and tell the
 * user once per failure streak (not on every retry or focus refetch).
 */
export function useRefetchErrorToast(query: { isError: boolean; error: unknown; data: unknown }) {
  const toast = useToast();
  const notified = useRef(false);
  const { isError, error, data } = query;
  useEffect(() => {
    if (!isError) {
      notified.current = false;
      return;
    }
    if (data === undefined || notified.current || isUnauthorized(error) || isMissingResource(error)) return;
    notified.current = true;
    toast.error("최신 정보를 불러오지 못했습니다", `화면은 마지막으로 불러온 내용입니다. ${errorMessage(error)}`);
  }, [isError, error, data, toast]);
}
