import { useMemo } from 'react'
import type { Textbook } from './useTextbooks'

/** Build slug → full_path and dir:file → full_path map for cross-device snip path resolution. */
export function usePathMap(textbooks: Textbook[]): Map<string, string> {
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const tb of textbooks) {
      map.set(tb.slug, tb.full_path)
      map.set(tb.dir_path + ':' + tb.file, tb.full_path)
    }
    return map
  }, [textbooks])
}
