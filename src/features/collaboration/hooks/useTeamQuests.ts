import { useQuery } from '@tanstack/react-query';
import { teamQuestsApi, type StudentCurrentTeamQuestResponse, type TeamQuest, type TeamQuestGroupProgress } from '../api/teamQuestsApi';

export const teamQuestKeys = {
  list: (classId: number | null) => ['team-quests', classId] as const,
  groupProgress: (questId: number | null, classId: number | null) => ['team-quest-group-progress', questId, classId] as const,
  studentCurrent: (studentId: number | null) => ['student-current-team-quest', studentId] as const,
};

export function useTeamQuests(classId: number | null) {
  return useQuery({
    queryKey: teamQuestKeys.list(classId),
    queryFn: async () => {
      if (!classId) return [] as TeamQuest[];
      return (await teamQuestsApi.getTeamQuests(classId)).data;
    },
    enabled: !!classId,
  });
}

export function useTeamQuestGroupProgress(questId: number | null, classId: number | null, enabled = true) {
  return useQuery({
    queryKey: teamQuestKeys.groupProgress(questId, classId),
    queryFn: async () => {
      if (!questId || !classId) return [] as TeamQuestGroupProgress[];
      return (await teamQuestsApi.getGroupProgress(questId, classId)).data;
    },
    enabled: enabled && !!questId && !!classId,
  });
}

export function useStudentCurrentTeamQuest(studentId: number | null) {
  return useQuery({
    queryKey: teamQuestKeys.studentCurrent(studentId),
    queryFn: async () => {
      if (!studentId) return { success: true, quest: null } as StudentCurrentTeamQuestResponse;
      return teamQuestsApi.getCurrentStudentQuest(studentId);
    },
    enabled: !!studentId,
  });
}
