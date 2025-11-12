import { useCallback, useEffect, useRef, useState } from 'react';

type QueueItem<T> = T;
type ActionFunction<T> = (item: QueueItem<T>) => Promise<void>;

type QueueEntry<T> = {
  item: QueueItem<T>;
  key: string;
};

type UseActionQueueOptions<T> = {
  dedupeKey?: (item: QueueItem<T>) => string | number;
};

const buildKey = <T>(item: QueueItem<T>, dedupeKey?: UseActionQueueOptions<T>['dedupeKey']): string => {
  if (dedupeKey) {
    return `custom:${dedupeKey(item)}`;
  }

  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return `primitive:${item}`;
  }

  return `json:${JSON.stringify(item)}`;
};

/**
 * Holds items to be processed in a queue while avoiding duplicate work.
 *
 * @param action action to perform on items
 * @param delay delay in milliseconds before performing action
 * @param options optional configuration such as a custom dedupe key extractor
 */
const useActionQueue = <T>(action: ActionFunction<T>, delay: number = 300, options: UseActionQueueOptions<T> = {}) => {
  const [queue, setQueue] = useState<QueueEntry<T>[]>([]);
  const isProcessing = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keySetRef = useRef<Set<string>>(new Set());

  const getKey = useCallback((item: QueueItem<T>) => buildKey(item, options.dedupeKey), [options.dedupeKey]);

  const addToQueue = useCallback(
    (item: QueueItem<T>) => {
      const key = getKey(item);

      setQueue((prevQueue) => {
        const hasKey = keySetRef.current.has(key);
        let updatedQueue = prevQueue;

        if (hasKey) {
          updatedQueue = prevQueue.filter((entry) => entry.key !== key);
        } else {
          keySetRef.current.add(key);
        }

        return [...updatedQueue, { item, key }];
      });
    },
    [getKey]
  );

  useEffect(() => {
    const processQueue = async () => {
      if (isProcessing.current || queue.length === 0) return;

      isProcessing.current = true;

      const [currentEntry, ...remainingQueue] = queue;

      try {
        await action(currentEntry.item);
      } catch {
        // do nothing if error
      }

      keySetRef.current.delete(currentEntry.key);
      setQueue(remainingQueue);
      isProcessing.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (queue.length > 0 && !timerRef.current) {
      timerRef.current = setTimeout(() => {
        processQueue();
      }, delay);
    }
  }, [queue, action, delay]);

  return addToQueue;
};

export default useActionQueue;
