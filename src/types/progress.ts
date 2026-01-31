export interface BookProgress {
  currentPage: number
  totalPages: number
  lastReadAt: string
}

export type ProgressMap = Record<string, BookProgress>
