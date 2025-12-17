import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Download, Upload, Pencil, Trash2, Package, Image as ImageIcon, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  images?: string[];
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
  const filterProduct = products.find(p => p.id === selectedProductId);

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

  const getProductImage = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.images?.[0];
  };

  const colorNameToHex = (colorName: string | null | undefined): string => {
    if (!colorName) return '#6b7280';
    // If already a HEX code, return it directly
    if (colorName.startsWith('#')) return colorName;
    const colors: Record<string, string> = {
      'красный': '#ef4444', 'red': '#ef4444',
      'синий': '#3b82f6', 'blue': '#3b82f6',
      'зеленый': '#22c55e', 'зелёный': '#22c55e', 'green': '#22c55e',
      'желтый': '#eab308', 'жёлтый': '#eab308', 'yellow': '#eab308',
      'оранжевый': '#f97316', 'orange': '#f97316',
      'фиолетовый': '#a855f7', 'purple': '#a855f7',
      'розовый': '#ec4899', 'pink': '#ec4899',
      'черный': '#1f2937', 'чёрный': '#1f2937', 'black': '#1f2937',
      'белый': '#f3f4f6', 'white': '#f3f4f6',
      'серый': '#6b7280', 'gray': '#6b7280', 'grey': '#6b7280',
      'коричневый': '#92400e', 'brown': '#92400e',
      'бежевый': '#d4b896', 'beige': '#d4b896',
      'голубой': '#38bdf8', 'light blue': '#38bdf8',
      'бирюзовый': '#14b8a6', 'teal': '#14b8a6', 'turquoise': '#14b8a6',
      'золотой': '#fbbf24', 'gold': '#fbbf24',
      'серебряный': '#9ca3af', 'silver': '#9ca3af',
    };
    return colors[colorName.toLowerCase()] || '#6b7280';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6" />
          <h1 className="text-xl md:text-2xl font-bold">Остатки товаров</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="flex-1 sm:flex-none">
            <Upload className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Экспорт</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Label className="cursor-pointer flex-1 sm:flex-none">
            <Button variant="outline" size="sm" asChild className="w-full">
              <span>
                <Download className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Импорт</span>
                <span className="sm:hidden">CSV</span>
              </span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </Label>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { resetForm(); setIsAddDialogOpen(true); }} className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Добавить остаток</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Товар</Label>
                  <Select value={formData.product_id} onValueChange={(v) => setFormData({ ...formData, product_id: v, color: "", attribute1_value: "", attribute2_value: "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите товар" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex items-center gap-2">
                            {p.images?.[0] ? (
                              <img src={p.images[0]} alt="" className="w-6 h-6 object-cover rounded" />
                            ) : (
                              <div className="w-6 h-6 bg-muted rounded flex items-center justify-center">
                                <ImageIcon className="w-3 h-3 text-muted-foreground" />
                              </div>
                            )}
                            <span className="truncate">{p.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedProduct?.colors && selectedProduct.colors.length > 0 && (
                  <div>
                    <Label className="mb-2 block">Цвет</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.colors.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: c })}
                          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-all ${
                            formData.color === c 
                              ? "border-primary ring-2 ring-primary/20" 
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span 
                            className="w-4 h-4 rounded-full border border-black/10" 
                            style={{ backgroundColor: colorNameToHex(c) }}
                          />
                          <span>{c}</span>
                          {formData.color === c && <Check className="w-3 h-3 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedProduct?.attributes?.map((attr, idx) => (
                  <div key={attr.name}>
                    <Label className="mb-2 block">{attr.name}</Label>
                    <div className="flex flex-wrap gap-2">
                      {attr.values.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFormData({ 
                            ...formData, 
                            [idx === 0 ? 'attribute1_value' : 'attribute2_value']: v 
                          })}
                          className={`px-3 py-2 text-sm rounded-md border transition-all ${
                            (idx === 0 ? formData.attribute1_value : formData.attribute2_value) === v 
                              ? "border-primary bg-primary/10 text-primary" 
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                
                <div>
                  <Label>Количество</Label>
                  <Input 
                    type="number" 
                    min="0"
                    value={formData.quantity === 0 ? '' : formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                
                <Button 
                  onClick={() => addMutation.mutate(formData)} 
                  disabled={!formData.product_id}
                  className="w-full"
                >
                  Добавить
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
        <Label className="whitespace-nowrap">Фильтр по товару:</Label>
        <Select value={selectedProductId || "__all__"} onValueChange={(v) => setSelectedProductId(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Все товары" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все товары</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt="" className="w-5 h-5 object-cover rounded" />
                  ) : (
                    <div className="w-5 h-5 bg-muted rounded flex items-center justify-center">
                      <ImageIcon className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="truncate">{p.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterProduct && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {filterProduct.images?.[0] && (
              <img src={filterProduct.images[0]} alt="" className="w-8 h-8 object-cover rounded hidden sm:block" />
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8">Загрузка...</div>
      ) : inventory.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Нет данных об остатках. Добавьте первую запись.
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Комбинация</TableHead>
                  <TableHead>Количество</TableHead>
                  <TableHead className="w-24">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {getProductImage(item.product_id) ? (
                        <img 
                          src={getProductImage(item.product_id)} 
                          alt="" 
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.color && (
                          <span 
                            className="w-4 h-4 rounded-full border border-black/10" 
                            style={{ backgroundColor: colorNameToHex(item.color) }}
                            title={item.color}
                          />
                        )}
                        <span>{formatCombination(item)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingItem?.id === item.id ? (
                        <Input 
                          type="number"
                          className="w-24"
                          value={editingItem.quantity === 0 ? '' : editingItem.quantity}
                          onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                          placeholder="0"
                        />
                      ) : (
                        <span className={item.quantity === 0 ? "text-destructive font-semibold" : ""}>
                          {item.quantity === 0 ? "Под заказ" : item.quantity}
                        </span>
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
                                  quantity: editingItem.quantity
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
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {inventory.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {getProductImage(item.product_id) ? (
                      <img 
                        src={getProductImage(item.product_id)} 
                        alt="" 
                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{item.product_name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        {item.color && (
                          <span 
                            className="w-3 h-3 rounded-full border border-black/10" 
                            style={{ backgroundColor: colorNameToHex(item.color) }}
                          />
                        )}
                        <span className="text-xs text-muted-foreground truncate">
                          {formatCombination(item)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-xs text-muted-foreground">Кол-во: </span>
                            {editingItem?.id === item.id ? (
                              <Input 
                                type="number"
                                className="w-16 h-7 text-sm inline-block"
                                value={editingItem.quantity === 0 ? '' : editingItem.quantity}
                                onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                placeholder="0"
                              />
                            ) : (
                              <span className={`font-medium ${item.quantity === 0 ? "text-destructive" : ""}`}>
                                {item.quantity === 0 ? "Под заказ" : item.quantity}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    {editingItem?.id === item.id ? (
                      <>
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => updateMutation.mutate({ 
                            id: item.id, 
                            data: { 
                              quantity: editingItem.quantity
                            } 
                          })}
                        >
                          Сохранить
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingItem(null)}>
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingItem(item)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Изменить
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
