import fs from 'node:fs';
import chokidar from 'chokidar';
import { log } from '../logger.js';

/**
 * Tail incrémental d'un fichier de log: à chaque nouveau write,
 * on lit le delta et on emit des lignes complètes au callback.
 *
 * @param {string} filePath
 * @param {(line: string) => void} onLine
 */
export function tail(filePath, onLine) {
  if (!fs.existsSync(filePath)) {
    log.warn(`Log file introuvable, sera surveillé: ${filePath}`);
  }

  // Position de départ = fin de fichier actuelle (on n'analyse pas l'historique)
  let pos = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  let buffer = '';

  const watcher = chokidar.watch(filePath, {
    persistent: true,
    usePolling: true, // ARK truncate parfois le log, le polling est plus fiable
    interval: 1000,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const readDelta = () => {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < pos) {
      // Fichier truncated/rotated → on reprend du début
      log.info(`Log rotaté: ${filePath}`);
      pos = 0;
      buffer = '';
    }
    if (stats.size === pos) return;
    const stream = fs.createReadStream(filePath, { start: pos, end: stats.size - 1 });
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          try { onLine(line); } catch (e) { log.error('Erreur callback log:', e); }
        }
      }
      pos = stats.size;
    });
    stream.on('error', (e) => log.error(`Lecture log ${filePath}:`, e.message));
  };

  watcher.on('add', readDelta);
  watcher.on('change', readDelta);
  watcher.on('error', (e) => log.error(`Watcher ${filePath}:`, e.message));

  log.info(`Tail démarré: ${filePath} (à partir de l'offset ${pos})`);
  return () => watcher.close();
}
