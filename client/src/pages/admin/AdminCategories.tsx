import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    sort_order: 0,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/admin/categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить категории', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData({ name: '', icon: '', sort_order: categories.length });
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      icon: category.icon || '',
      sort_order: category.sort_order || 0,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingCategory 
        ? `/api/admin/categories/${editingCategory.id}`
        : '/api/admin/categories';
      
      const response = await fetch(url, {
        method: editingCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save category');

      toast({
        title: 'Успешно',
        description: editingCategory ? 'Категория обновлена' : 'Категория добавлена',
      });

      setIsDialogOpen(false);
      fetchCategories();
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить категорию', variant: 'destructive' });
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Удалить эту категорию? Товары в ней останутся без категории.')) return;

    try {
      await fetch(`/api/admin/categories/${categoryId}`, { method: 'DELETE' });
      toast({ title: 'Успешно', description: 'Категория удалена' });
      fetchCategories();
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось удалить категорию', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Всего категорий: {categories.length}
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Добавить категорию
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Редактировать категорию' : 'Добавить категорию'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Название категории"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Иконка (эмодзи или текст)</Label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="📦"
                />
              </div>
              <div className="space-y-2">
                <Label>Порядок сортировки</Label>
                <Input
                  type="number"
                  value={formData.sort_order === 0 ? '' : formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">
                  {editingCategory ? 'Сохранить' : 'Добавить'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {categories.map((category, index) => (
          <Card key={category.id}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="text-muted-foreground cursor-grab flex-shrink-0">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  <div className="text-2xl flex-shrink-0">{category.icon || '📁'}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{category.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">ID: {category.id}</p>
                  </div>
                </div>
                <div className="flex gap-2 self-end sm:self-auto flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(category)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(category.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Категории не найдены. Добавьте первую категорию!
        </div>
      )}
    </div>
  );
}
