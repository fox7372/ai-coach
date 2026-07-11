export type Course = {
  id: number
  name: string
  description: string | null
  progress: number
  mastery: number
  has_progress_evidence: boolean
  has_mastery_evidence: boolean
}

export const fallbackCourses: Course[] = []
