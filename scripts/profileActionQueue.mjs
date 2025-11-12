import { performance } from 'node:perf_hooks';

const createDataset = (uniqueItems, duplicatesPerItem) => {
  const items = [];
  for (let i = 0; i < uniqueItems; i += 1) {
    const base = {
      id: `plugin-${i}`,
      favoritesCount: Math.floor(Math.random() * 1000),
      name: `Plugin ${i}`,
      updatedAt: Date.now() - Math.floor(Math.random() * 10_000),
    };
    for (let j = 0; j < duplicatesPerItem; j += 1) {
      items.push({ ...base, favoritesCount: base.favoritesCount + j });
    }
  }
  return items;
};

const legacyAddToQueue = (queue, item) => {
  const filteredQueue = queue.filter((queuedItem) => JSON.stringify(queuedItem) !== JSON.stringify(item));
  return [...filteredQueue, item];
};

const createOptimizedAlgorithm = () => {
  const keySet = new Set();
  return (queue, item) => {
    const key = item.id ?? JSON.stringify(item);

    if (!keySet.has(key)) {
      keySet.add(key);
      return [...queue, { key, item }];
    }

    const filteredQueue = queue.filter((queuedItem) => queuedItem.key !== key);
    return [...filteredQueue, { key, item }];
  };
};

const runBenchmark = ({ algorithm, iterations, datasetFactory }) => {
  const dataset = datasetFactory();
  const start = performance.now();
  let queue = [];

  for (let i = 0; i < iterations; i += 1) {
    const item = dataset[i % dataset.length];
    queue = algorithm(queue, item);
  }

  return {
    durationMs: Number((performance.now() - start).toFixed(2)),
    finalQueueSize: queue.length,
  };
};

const main = () => {
  const mode = process.argv[2] ?? 'legacy';
  const iterations = Number(process.argv[3] ?? 50_000);
  const datasetFactory = () => createDataset(500, 5);

  if (mode === 'legacy') {
    const result = runBenchmark({ algorithm: legacyAddToQueue, iterations, datasetFactory });
    console.log(
      JSON.stringify({
        mode,
        iterations,
        ...result,
      })
    );
    return;
  }

  if (mode === 'optimized') {
    const optimizedAlgorithm = createOptimizedAlgorithm();
    const result = runBenchmark({
      algorithm: (queue, item) => optimizedAlgorithm(queue, item),
      iterations,
      datasetFactory,
    });
    console.log(
      JSON.stringify({
        mode,
        iterations,
        ...result,
      })
    );
    return;
  }

  console.error(`Unknown mode: ${mode}`);
  process.exitCode = 1;
};

main();
