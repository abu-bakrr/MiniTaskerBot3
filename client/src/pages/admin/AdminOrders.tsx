import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Eye, Package, User, MapPin, Phone, Calendar, CreditCard, Receipt, X, ExternalLink, Search, Clock } from 'lucide-react';

interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  selected_color: string;
  selected_attributes: any;
  product_images: string[];
  availability_status?: string;
  backorder_lead_time_days?: number;
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
  has_backorder?: boolean;
  backorder_delivery_date?: string;
  estimated_delivery_days?: number;
}

const DEFAULT_STATUSES = [
  { value: 'reviewing', label: 'Рассматривается' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'processing', label: 'Собирается' },
  { value: 'shipped', label: 'В пути' },
  { value: 'delivered', label: 'Доставлен' },
  { value: 'cancelled', label: 'Отменён' },
];

const STATUS_ORDER = ['reviewing', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
  'new': 'Новый',
  'confirmed': 'Подтверждён',
  'pending': 'В ожидании',
  'reviewing': 'Рассматривается',
  'awaiting_payment': 'Ожидает оплаты',
  'paid': 'Оплачен',
  'processing': 'Собирается',
  'shipped': 'В пути',
  'delivered': 'Доставлен',
  'cancelled': 'Отменён',
};

const getStatusLabel = (status: string): string => {
  return STATUS_LABELS[status] || status;
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
    const label = getStatusLabel(status);
    
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-cyan-100 text-cyan-800',
      pending: 'bg-yellow-100 text-yellow-800',
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
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <div className="flex gap-2 items-center justify-between">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Все" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {orderStatuses.map(status => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {filteredOrders.length} из {orders.length}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {filteredOrders.map(order => (
          <div 
            key={order.id}
            onClick={() => setSelectedOrder(order)}
            className="bg-card border border-border rounded-xl p-3 active:bg-muted/50 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 6)}</span>
                {getStatusBadge(order.status)}
                {order.has_backorder && (
                  <Badge className="bg-orange-100 text-orange-800 text-[10px] px-1.5 py-0">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    Заказ
                  </Badge>
                )}
              </div>
              <span className="text-base font-bold whitespace-nowrap">{formatPrice(order.total)}</span>
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {(order.customer_name || order.first_name || 'Клиент').split(' ')[0]}
                </span>
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {order.items?.length || 0}
                </span>
              </div>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(order.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {orders.length === 0 ? 'Заказы не найдены' : 'Ничего не найдено по запросу'}
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Заказ #{selectedOrder?.id.slice(0, 6)}</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(selectedOrder.status)}
                  {selectedOrder.has_backorder && (
                    <Badge className="bg-orange-100 text-orange-800 text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      Под заказ
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(selectedOrder.created_at)}</span>
              </div>

              {selectedOrder.estimated_delivery_days && (
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg text-sm">
                  <div className="flex items-center gap-2 text-blue-800">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Доставка: <strong>{selectedOrder.estimated_delivery_days} дн.</strong></span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Изменить статус</Label>
                <Select 
                  value={selectedOrder.status} 
                  onValueChange={(value) => updateOrderStatus(selectedOrder.id, value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderStatuses.map(status => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Свой статус"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    className="min-w-0 flex-1 h-9 text-sm"
                  />
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (customStatus) {
                        updateOrderStatus(selectedOrder.id, customStatus);
                        setCustomStatus('');
                      }
                    }}
                    disabled={!customStatus}
                  >
                    OK
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Клиент</Label>
                <div className="bg-muted/50 p-3 rounded-lg space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{selectedOrder.customer_name || selectedOrder.first_name || 'Не указано'}{selectedOrder.last_name && ` ${selectedOrder.last_name}`}</span>
                  </div>
                  {selectedOrder.customer_phone && (
                    <a href={`tel:${selectedOrder.customer_phone}`} className="flex items-center gap-2 text-primary">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {selectedOrder.customer_phone}
                    </a>
                  )}
                  {selectedOrder.user_email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{selectedOrder.user_email}</span>
                    </div>
                  )}
                  {selectedOrder.delivery_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs leading-relaxed">{selectedOrder.delivery_address}</span>
                    </div>
                  )}
                  {selectedOrder.payment_method && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border mt-2">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{getPaymentMethodLabel(selectedOrder.payment_method)}</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedOrder.payment_receipt_url && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" />
                    Чек оплаты
                  </Label>
                  <div 
                    className="relative cursor-pointer rounded-lg overflow-hidden border"
                    onClick={() => openReceiptModal(selectedOrder.payment_receipt_url!)}
                  >
                    <img 
                      src={selectedOrder.payment_receipt_url} 
                      alt="Чек"
                      className="w-full max-h-40 object-contain bg-muted"
                    />
                    <div className="absolute bottom-2 right-2">
                      <Button size="sm" variant="secondary" className="h-7 text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Открыть
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Товары ({selectedOrder.items?.length || 0})</Label>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex gap-2.5 p-2 bg-muted/50 rounded-lg">
                      {item.product_images && item.product_images[0] ? (
                        <img 
                          src={item.product_images[0]} 
                          alt={item.name}
                          className="w-12 h-12 object-cover rounded-lg shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-background rounded-lg flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatPrice(item.price)} × {item.quantity}</span>
                          {item.selected_color && <span>• {item.selected_color}</span>}
                        </div>
                      </div>
                      <div className="text-sm font-semibold shrink-0">
                        {formatPrice(item.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="text-sm font-medium">Итого:</span>
                <span className="text-lg font-bold">{formatPrice(selectedOrder.total)}</span>
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
