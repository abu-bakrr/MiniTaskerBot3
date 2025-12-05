import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Eye, Package, User, MapPin, Phone, Calendar, CreditCard, Receipt, X, ExternalLink, Search } from 'lucide-react';

interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  selected_color: string;
  selected_attributes: any;
  product_images: string[];
}

interface Order {
  id: string;
  user_id: string;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_receipt_url?: string;
  delivery_address: string;
  customer_phone: string;
  customer_name: string;
  created_at: string;
  user_email: string;
  first_name: string;
  last_name: string;
  items: OrderItem[];
}

const DEFAULT_STATUSES = [
  { value: 'reviewing', label: 'Рассматривается' },
  { value: 'awaiting_payment', label: 'Ожидает оплаты' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'processing', label: 'Собирается' },
  { value: 'shipped', label: 'В пути' },
  { value: 'delivered', label: 'Доставлен' },
  { value: 'cancelled', label: 'Отменён' },
];

const STATUS_ORDER = ['reviewing', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

const LEGACY_STATUS_MAP: Record<string, string> = {
  'new': 'reviewing',
  'confirmed': 'reviewing',
  'pending': 'reviewing',
};

const normalizeStatus = (status: string): string => {
  return LEGACY_STATUS_MAP[status] || status;
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [customStatus, setCustomStatus] = useState('');
  const [orderStatuses, setOrderStatuses] = useState(DEFAULT_STATUSES);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter(order => 
      order.customer_name?.toLowerCase().includes(query) ||
      order.customer_phone?.toLowerCase().includes(query) ||
      order.user_email?.toLowerCase().includes(query) ||
      order.first_name?.toLowerCase().includes(query) ||
      order.last_name?.toLowerCase().includes(query) ||
      order.id.toLowerCase().includes(query) ||
      order.delivery_address?.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  const openReceiptModal = (url: string) => {
    setReceiptImageUrl(url);
    setReceiptModalOpen(true);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      'click': 'Click',
      'payme': 'Payme',
      'uzum': 'Uzum Bank',
      'card_transfer': 'Перевод на карту',
    };
    return labels[method] || method;
  };

  useEffect(() => {
    fetchOrders();
    fetchConfig();
  }, [statusFilter]);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      if (config.orderStatuses) {
        const statusesMap = config.orderStatuses as Record<string, string>;
        const statuses = STATUS_ORDER
          .filter(key => statusesMap[key] || DEFAULT_STATUSES.find(s => s.value === key))
          .map(key => ({
            value: key,
            label: statusesMap[key] || DEFAULT_STATUSES.find(s => s.value === key)?.label || key,
          }));
        setOrderStatuses(statuses);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await fetch(`/api/admin/orders?${params}`);
      const data = await response.json();
      setOrders(data);
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить заказы', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast({ title: 'Успешно', description: 'Статус заказа обновлен' });
      fetchOrders();
      
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status });
      }
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось обновить статус', variant: 'destructive' });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(price) + ' сум';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = orderStatuses.find(s => s.value === status);
    const label = statusConfig?.label || status;
    
    const colors: Record<string, string> = {
      reviewing: 'bg-slate-100 text-slate-800',
      awaiting_payment: 'bg-amber-100 text-amber-800',
      paid: 'bg-emerald-100 text-emerald-800',
      processing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
        {label}
      </Badge>
    );
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, телефону, email, адресу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-2 items-center">
            <Label className="whitespace-nowrap">Статус:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {orderStatuses.map(status => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Найдено: {filteredOrders.length} из {orders.length}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredOrders.map(order => (
          <Card key={order.id}>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">#{order.id.slice(0, 8)}</span>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formatDate(order.created_at)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {order.customer_name || order.first_name || order.user_email || 'Неизвестно'}
                  </div>
                </div>
                <div className="flex flex-col sm:items-end gap-2">
                  <div className="text-xl font-bold">{formatPrice(order.total)}</div>
                  <div className="text-sm text-muted-foreground">
                    {order.items?.length || 0} товар(ов)
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Подробнее
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {orders.length === 0 ? 'Заказы не найдены' : 'Ничего не найдено по запросу'}
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Заказ #{selectedOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Статус</Label>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Дата</Label>
                  <p className="mt-1">{formatDate(selectedOrder.created_at)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Изменить статус</Label>
                <div className="flex gap-2">
                  <Select 
                    value={selectedOrder.status} 
                    onValueChange={(value) => updateOrderStatus(selectedOrder.id, value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orderStatuses.map(status => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Или свой статус"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    className="min-w-0 flex-1"
                  />
                  <Button 
                    variant="outline"
                    onClick={() => {
                      if (customStatus) {
                        updateOrderStatus(selectedOrder.id, customStatus);
                        setCustomStatus('');
                      }
                    }}
                    disabled={!customStatus}
                    className="flex-shrink-0"
                  >
                    Применить
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Информация о клиенте</Label>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {selectedOrder.customer_name || selectedOrder.first_name || 'Не указано'}
                    {selectedOrder.last_name && ` ${selectedOrder.last_name}`}
                  </div>
                  {selectedOrder.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {selectedOrder.customer_phone}
                    </div>
                  )}
                  {selectedOrder.user_email && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {selectedOrder.user_email}
                    </div>
                  )}
                  {selectedOrder.delivery_address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedOrder.delivery_address}
                    </div>
                  )}
                  {selectedOrder.payment_method && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {getPaymentMethodLabel(selectedOrder.payment_method)}
                    </div>
                  )}
                </div>
              </div>

              {selectedOrder.payment_receipt_url && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Чек оплаты (перевод на карту)
                  </Label>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="relative group cursor-pointer" onClick={() => openReceiptModal(selectedOrder.payment_receipt_url!)}>
                      <img 
                        src={selectedOrder.payment_receipt_url} 
                        alt="Чек оплаты"
                        className="w-full max-h-64 object-contain rounded-lg border"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <div className="text-white flex items-center gap-2">
                          <ExternalLink className="h-5 w-5" />
                          <span>Увеличить</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReceiptModal(selectedOrder.payment_receipt_url!)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Просмотр
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(selectedOrder.payment_receipt_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Открыть
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-muted-foreground">Товары</Label>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex gap-4 p-3 bg-muted rounded-lg">
                      {item.product_images && item.product_images[0] ? (
                        <img 
                          src={item.product_images[0]} 
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-background rounded flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                        {item.selected_color && (
                          <p className="text-sm">Цвет: {item.selected_color}</p>
                        )}
                      </div>
                      <div className="font-bold">
                        {formatPrice(item.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-lg font-medium">Итого:</span>
                <span className="text-2xl font-bold">{formatPrice(selectedOrder.total)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-2">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-background/80"
              onClick={() => setReceiptModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            {receiptImageUrl && (
              <img 
                src={receiptImageUrl} 
                alt="Чек оплаты"
                className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
