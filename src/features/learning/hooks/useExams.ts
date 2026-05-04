import { useQuery } from '@tanstack/react-query';
import { examsApi, type Exam, type ExamGrade } from '../api/examsApi';

export const examKeys = {
  list: (classId: number | null) => ['exams', classId] as const,
  grades: (examId: number | null) => ['exam-grades', examId] as const,
};

export function useExams(classId: number | null) {
  return useQuery({
    queryKey: examKeys.list(classId),
    queryFn: async () => {
      if (!classId) return [] as Exam[];
      return (await examsApi.getExams(classId)).data;
    },
    enabled: !!classId,
  });
}

export function useExamGrades(examId: number | null, enabled = true) {
  return useQuery({
    queryKey: examKeys.grades(examId),
    queryFn: async () => {
      if (!examId) return { exam: null, grades: [] as ExamGrade[] };
      const data = await examsApi.getExamGrades(examId);
      return data.data ?? { exam: data.exam, grades: data.grades };
    },
    enabled: enabled && !!examId,
  });
}
