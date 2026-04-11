import { useQuery } from '@tanstack/react-query';

import { examsApi, type Exam, type ExamGrade } from '@/api/exams';

export function useExams(classId: number | null) {
  return useQuery({
    queryKey: ['exams', classId],
    queryFn: async () => {
      if (!classId) return [] as Exam[];
      const data = await examsApi.getExams(classId);
      return data.data;
    },
    enabled: !!classId,
  });
}

export function useExamGrades(examId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['exam-grades', examId],
    queryFn: async () => {
      if (!examId) return { exam: null, grades: [] as ExamGrade[] };
      const data = await examsApi.getExamGrades(examId);
      return { exam: data.exam, grades: data.grades };
    },
    enabled: enabled && !!examId,
  });
}
