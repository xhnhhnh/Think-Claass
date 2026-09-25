import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Sparkles, Users, Upload, ImageIcon, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useClasses } from '@/hooks/queries/useClasses';
import { useClassPets, useTeacherPetMutation } from '@/features/pet/hooks/usePet';
import { getDefaultPetStageImage, getEvolutionStage, getPetDisplayImage, getPetElement, PET_ELEMENTS } from '@/features/pet/petConfig';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FileInput } from '@/components/ui/file-input';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Toolbar } from '@/components/ui/toolbar';
import { cn } from '@/lib/utils';

/**
 * 班级精灵管理.
 *
 * The element tiles, the stage gallery and the per-element colours are the game feel
 * of this page, so they stay - what changed is how the selected tile is drawn: the
 * border used to be assembled at runtime (`border-${el.color.split('-')[1]}-500`, a
 * class that only exists if Tailwind happened to see it) and is now the static
 * `border-role`. The hidden uploader is `FileInput`, which gives it a name, and the
 * editor is the kit `Dialog` instead of a hand-built overlay with a raw close button.
 */
export default function TeacherPets() {
  useStore((state) => state.user);
  const { data: classes = [] } = useClasses();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const { data: students = [], isLoading: loading, refetch } = useClassPets(selectedClassId || null);
  const petMutation = useTeacherPetMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editingImages, setEditingImages] = useState<any>({});
  const [savingImages, setSavingImages] = useState(false);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(String(classes[0].id));
    }
  }, [classes, selectedClassId]);

  const openModal = (student: any) => {
    setEditingStudent(student);
    if (student.has_pet) {
      setEditingImages({ ...student.pet });
    } else {
      setEditingImages({ element_type: 'fire', level: 1, experience: 0, attack_power: 10 }); // default
    }
    setIsModalOpen(true);
  };

  const handleStageImageUpload = (e: React.ChangeEvent<HTMLInputElement>, stage: number) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 5) {
        toast.error('图片/动图大小不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingImages((prev: any) => ({
          ...prev,
          [`image_stage${stage}`]: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!editingImages.element_type) {
      toast.error('请选择精灵属性');
      return;
    }
    setSavingImages(true);
    try {
      await petMutation.mutateAsync({ studentId: editingStudent.student_id, data: editingImages });
      toast.success(editingStudent.has_pet ? '外观修改成功！' : '精灵分配成功！');
      setIsModalOpen(false);
      await refetch();
    } finally {
      setSavingImages(false);
    }
  };

  const renderPetImage = (pet: any) => {
    if (!pet) return null;
    const imgUrl = getPetDisplayImage(pet);
    return <img src={imgUrl ?? ''} alt="Pet" className="size-16 rounded-full border-2 border-line-1 object-contain shadow-sm" />;
  };

  // The page has no page-level button; its one action is re-reading the class roster.
  useRegisterPageCommands([
    {
      id: 'teacher-pets:refresh',
      label: '刷新精灵列表',
      icon: Sparkles,
      keywords: ['精灵', '宠物', '外观'],
      run: () => void refetch(),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="班级精灵管理"
      description="查看、分配或管理学生的学习精灵及进化外观"
      toolbar={
        <Toolbar
          filters={
            <>
              <Users className="size-5 text-fg-3" />
              <Select
                aria-label="选择班级"
                wrapperClassName="w-40 sm:w-56"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Select>
            </>
          }
        />
      }
    >

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-64 rounded-card" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="暂无学生数据"
          className="bg-surface-2"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {students.map((student) => {
            const pet = student.pet;
            const element = pet ? getPetElement(pet.element_type) : null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={student.student_id}
                className="group flex flex-col rounded-card border border-line-1 bg-surface-2/80 p-5 shadow-card backdrop-blur-xl transition-all hover:shadow-raised"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-bold text-fg-1">{student.student_name}</span>
                  {!student.has_pet && (
                    <Badge variant="secondary">
                      未领养
                    </Badge>
                  )}
                  {student.has_pet && element && (
                    <Badge className={cn('font-bold text-role-contrast shadow-sm', element.color)}>
                      {element.name}
                    </Badge>
                  )}
                </div>

                <div className="relative flex flex-1 flex-col items-center justify-center py-4">
                  {student.has_pet ? (
                    <>
                      <div className={cn('mb-3 flex size-24 items-center justify-center rounded-full shadow-inner', element?.bg || 'bg-surface-3/50')}>
                        {renderPetImage(pet)}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-fg-2">Lv.{pet.level} {getEvolutionStage(pet.level)}</div>
                        <div className="mt-1 text-xs text-fg-3">攻击力: {pet.attack_power} | 经验: {pet.experience}</div>
                      </div>
                    </>
                  ) : (
                    <div className="mb-3 flex size-24 flex-col items-center justify-center rounded-full border-2 border-dashed border-line-1 bg-surface-3/50 text-fg-3">
                      <Sparkles className="mb-1 size-6 opacity-50" />
                      <span className="text-xs font-medium">无精灵</span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <Button
                    variant={student.has_pet ? 'secondary' : 'outline'}
                    className={cn(
                      'w-full',
                      !student.has_pet && 'border-role/20 bg-role/5 text-role hover:bg-role/10 hover:text-role',
                    )}
                    onClick={() => openModal(student)}
                  >
                    {student.has_pet ? (
                      <>
                        <ImageIcon data-icon="inline-start" /> 管理外观与属性
                      </>
                    ) : (
                      <>
                        <Plus data-icon="inline-start" /> 为其分配精灵
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      {editingStudent && (
        <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Sparkles className="mr-3 size-6 text-role" />
                {editingStudent.has_pet ? `管理 ${editingStudent.student_name} 的精灵` : `为 ${editingStudent.student_name} 分配精灵`}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-8">
              {/* Element Selection */}
              <div>
                <h3 className="mb-4 flex items-center text-sm font-bold text-fg-2">
                  1. 选择精灵属性 (Element Type)
                </h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {PET_ELEMENTS.map((el) => (
                    <Button
                      key={el.id}
                      type="button"
                      variant="outline"
                      aria-pressed={editingImages.element_type === el.id}
                      onClick={() => setEditingImages({ ...editingImages, element_type: el.id })}
                      className={cn(
                        'h-auto flex-col gap-1 rounded-card border-2 p-3',
                        editingImages.element_type === el.id
                          ? `border-role ${el.bg} shadow-card`
                          : 'border-line-1 bg-surface-3/50 hover:border-role/30',
                      )}
                    >
                      <div className="text-2xl">{el.icon}</div>
                      <div className="text-xs font-bold text-fg-2">{el.name}</div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Base Stats Setting */}
              <div>
                <h3 className="mb-4 flex items-center text-sm font-bold text-fg-2">
                  2. 基础数值设置 (Base Stats)
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="等级 (Level 1-6)">
                    <Input
                      type="number"
                      min="1"
                      max="6"
                      value={editingImages.level || 1}
                      onChange={(e) => setEditingImages({ ...editingImages, level: Number(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="经验值 (Experience)">
                    <Input
                      type="number"
                      min="0"
                      value={editingImages.experience || 0}
                      onChange={(e) => setEditingImages({ ...editingImages, experience: Number(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="攻击力 (Attack Power)">
                    <Input
                      type="number"
                      min="0"
                      value={editingImages.attack_power || 10}
                      onChange={(e) => setEditingImages({ ...editingImages, attack_power: Number(e.target.value) })}
                    />
                  </FormField>
                </div>
              </div>

              {/* Stages Selection */}
              <div>
                <h3 className="mb-4 flex items-center text-sm font-bold text-fg-2">
                  3. 配置阶段外观 (可选，支持 JPG/PNG/GIF，最高 5MB)
                </h3>
                <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((level) => {
                    const stageKey = `image_stage${level}`;
                    const currentImage = editingImages[stageKey] || editingImages.custom_image || getDefaultPetStageImage(level, editingImages.element_type);

                    return (
                      <div key={level} className="flex flex-col items-center">
                        <Badge variant="info" className="mb-2">
                          Lv.{level} {getEvolutionStage(level)}
                        </Badge>

                        <label className="group relative aspect-square w-full max-w-[160px] cursor-pointer">
                          <div className={cn('flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-card border-2 transition-all', currentImage ? 'border-role/40 bg-surface-2 shadow-card' : 'border-dashed border-line-1 bg-surface-3/50 hover:border-role/40')}>
                            <img src={currentImage} alt={`Lv.${level}`} className="h-full w-full object-contain" />
                          </div>

                          <div className="absolute inset-0 flex items-center justify-center rounded-card bg-fg-1/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex flex-col items-center text-xs font-bold text-role-contrast">
                              <Upload className="mb-1 size-5" />
                              更换图片
                            </span>
                          </div>

                          <FileInput
                            label={`Lv.${level} 阶段图片`}
                            accept="image/*"
                            onChange={(e) => handleStageImageUpload(e, level)}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={savingImages}
              >
                {savingImages ? (
                  <>
                    <Spinner size="sm" label="正在保存" />
                    保存中...
                  </>
                ) : '确认保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageScaffold>
  );
}
