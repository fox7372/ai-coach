export type Course = {
  id: number
  name: string
  description: string | null
  progress: number
  mastery: number
}

export const fallbackCourses: Course[] = []
