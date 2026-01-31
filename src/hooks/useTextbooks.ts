import textbooks from 'virtual:textbooks'

export interface Textbook {
  slug: string
  title: string
  file: string
}

export function useTextbooks(): Textbook[] {
  return textbooks as Textbook[]
}
