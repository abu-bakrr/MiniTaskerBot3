import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Download, Upload, Pencil, Trash2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  colors?: string[];
  attributes?: { name: string; values: string[] }[];
}

interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  color: string | null;
  attribute1_value: string | null;
  attribute2_value: string | null;
  quantity: number;
  backorder_lead_time_days: number | null;
}

export default function AdminInventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  const [formData, setFormData] = useState({
    product_id: "",
    color: "",
    attribute1_value: "",
    attribute2_value: "",
    quantity: 0,
    backorder_lead_time_days: "",
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const { data: inventory = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/admin/inventory", selectedProductId],
    queryFn: async () => {
      const url = selectedProductId 
        ? `/api/admin/inventory?product_id=${selectedProductId}`
        : "/api/admin/inventory";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
  });

  const selectedProduct = products.find(p => p.id === formData.product_id);

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...data,
          color: data.color || null,
          attribute1_value: data.attribute1_value || null,
          attribute2_value: data.attribute2_value || null,
          backorder_lead_time_days: data.backorder_lead_time_days ? parseInt(data.backorder_lead_time_days) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add inventory");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Остаток добавлен" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось добавить остаток", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const res = await fetch(`/api/admin/inventory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quantity: data.quantity,
          backorder_lead_time_days: data.backorder_lead_time_days ? parseInt(data.backorder_lead_time_days as string) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update inventory");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
      setEditingItem(null);
      toast({ title: "Остаток обновлён" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/inventory/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete inventory");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
      toast({ title: "Запись удалена" });
    },
  });

  const resetForm = () => {
    setFormData({
      product_id: "",
      color: "",
      attribute1_value: "",
      attribute2_value: "",
      quantity: 0,
      backorder_lead_time_days: "",
    });
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/inventory/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inventory.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Экспорт завершён" });
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/inventory/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
      toast({ title: "Импорт завершён", description: `Импортировано: ${data.imported_count}` });
    } catch (err: any) {
      toast({ title: "Ошибка импорта", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const formatCombination = (item: InventoryItem) => {
    const parts = [];
    if (item.color) parts.push(item.color);
    if (item.attribute1_value) parts.push(item.attribute1_value);
    if (item.attribute2_value) parts.push(item.attribute2_value);
    return parts.length > 0 ? parts.join(" / ") : "Без вариантов";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Остатки товаров</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Экспорт CSV
          </Button>
          <Label className="cursor-pointer">
            <Button variant="outline" asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Импорт CSV
              </span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </Label>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Добавить остаток</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Товар</Label>
                  <Select value={formData.product_id} onValueChange={(v) => setFormData({ ...formData, product_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите товар" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedProduct?.colors && selectedProduct.colors.length > 0 && (
                  <div>
                    <Label>Цвет</Label>
                    <Select value={formData.color || "__none__"} onValueChange={(v) => setFormData({ ...formData, color: v === "__none__" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите цвет" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Без цвета</SelectItem>
                        {selectedProduct.colors.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {selectedProduct?.attributes?.map((attr, idx) => (
                  <div key={attr.name}>
                    <Label>{attr.name}</Label>
                    <Select 
                      value={(idx === 0 ? formData.attribute1_value : formData.attribute2_value) || "__none__"}
                      onValueChange={(v) => setFormData({ 
                        ...formData, 
                        [idx === 0 ? 'attribute1_value' : 'attribute2_value']: v === "__none__" ? "" : v 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Выберите ${attr.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Не выбрано</SelectItem>
                        {attr.values.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                
                <div>
                  <Label>Количество</Label>
                  <Input 
                    type="number" 
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>
                
                <div>
                  <Label>Срок доставки "под заказ" (дней)</Label>
                  <Input 
                    type="number" 
                    min="1"
                    placeholder="Оставьте пустым если не применимо"
                    value={formData.backorder_lead_time_days}
                    onChange={(e) => setFormData({ ...formData, backorder_lead_time_days: e.target.value })}
                  />
                </div>
                
                <Button onClick={() => addMutation.mutate(formData)} disabled={!formData.product_id}>
                  Добавить
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <Label>Фильтр по товару:</Label>
        <Select value={selectedProductId || "__all__"} onValueChange={(v) => setSelectedProductId(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Все товары" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все товары</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Загрузка...</div>
      ) : inventory.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Нет данных об остатках. Добавьте первую запись.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Комбинация</TableHead>
              <TableHead>Количество</TableHead>
              <TableHead>Срок доставки (дней)</TableHead>
              <TableHead className="w-24">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.product_name}</TableCell>
                <TableCell>{formatCombination(item)}</TableCell>
                <TableCell>
                  {editingItem?.id === item.id ? (
                    <Input 
                      type="number"
                      className="w-24"
                      value={editingItem.quantity}
                      onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                    />
                  ) : (
                    <span className={item.quantity === 0 ? "text-destructive font-semibold" : ""}>
                      {item.quantity === 0 ? "Под заказ" : item.quantity}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {editingItem?.id === item.id ? (
                    <Input 
                      type="number"
                      className="w-24"
                      value={editingItem.backorder_lead_time_days || ""}
                      onChange={(e) => setEditingItem({ 
                        ...editingItem, 
                        backorder_lead_time_days: e.target.value ? parseInt(e.target.value) : null 
                      })}
                    />
                  ) : (
                    item.backorder_lead_time_days || "—"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {editingItem?.id === item.id ? (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => updateMutation.mutate({ 
                            id: item.id, 
                            data: { 
                              quantity: editingItem.quantity, 
                              backorder_lead_time_days: editingItem.backorder_lead_time_days?.toString() || "" 
                            } 
                          })}
                        >
                          Сохранить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => setEditingItem(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
