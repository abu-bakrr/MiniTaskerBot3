import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Package, ChevronDown, MapPin, CreditCard, Clock, CheckCircle2, Truck, PackageCheck, MessageCircle, Phone, Copy, Check, Image as ImageIcon, Search, RefreshCw, ShoppingCart, Sparkles, Ban, Wallet, PackageOpen, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useConfig } from '@/hooks/useConfig';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface OrderItem {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  selected_color?: string;
  selected_attributes?: Record<string, string>;
}

interface Order {
  id: number;
  status: string;
  total: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  payment_method: string;
  items: OrderItem[];
}

const DEFAULT_STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  awaiting_payment: { label: 'Ожидает оплаты', icon: Wallet, color: 'bg-amber-100 text-amber-800 border-amber-200' },
  paid: { label: 'Оплачен', icon: FileCheck, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  processing: { label: 'Собирается', icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  shipped: { label: 'В пути', icon: Truck, color: 'bg-purple-100 text-purple-800 border-purple-200' },
  delivered: { label: 'Доставлен', icon: PackageCheck, color: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Отменён', icon: Ban, color: 'bg-red-100 text-red-800 border-red-200' },
};

const STATUS_ORDER = ['awaiting_payment', 'paid', 'processing', 'shipped', 'delivered'];

const VALID_STATUSES = new Set(['awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']);

const LEGACY_STATUS_MAP: Record<string, string> = {
  'new': 'awaiting_payment',
  'confirmed': 'awaiting_payment',
  'pending': 'awaiting_payment',
};

const normalizeStatus = (status: string): string => {
  if (VALID_STATUSES.has(status)) return status;
  if (LEGACY_STATUS_MAP[status]) return LEGACY_STATUS_MAP[status];
  return 'awaiting_payment';
};

const getStatusSteps = (orderStatuses: Record<string, string>) => {
  return STATUS_ORDER.map(key => ({
    key,
    label: orderStatuses[key] || DEFAULT_STATUS_CONFIG[key]?.label || key,
    icon: DEFAULT_STATUS_CONFIG[key]?.icon || Package,
  }));
};

const getPaymentMethodLabel = (method: string): string => {
  switch (method) {
    case 'card_transfer': return 'Перевод на карту';
    case 'click': return 'Click';
    case 'payme': return 'Payme';
    case 'uzum': return 'Uzum Bank';
    case 'cash': return 'Наличные';
    default: return method;
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;
  return formatDate(dateString);
};

export default function Orders() {
  const [, navigate] = useLocation();
  const { config, formatPrice } = useConfig();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const [isRepeating, setIsRepeating] = useState(false);

  const orderStatuses = config?.orderStatuses || {};
  const statusSteps = useMemo(() => getStatusSteps(orderStatuses), [orderStatuses]);

  const getStatusIndex = useCallback((status: string): number => {
    if (status === 'cancelled') return -1;
    const normalizedStatus = normalizeStatus(status);
    const index = statusSteps.findIndex(s => s.key === normalizedStatus);
    return index >= 0 ? index : 0;
  }, [statusSteps]);

  const getStatusColor = (status: string): string => {
    const normalizedStatus = normalizeStatus(status);
    return DEFAULT_STATUS_CONFIG[normalizedStatus]?.color || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusLabel = (status: string): string => {
    const normalizedStatus = normalizeStatus(status);
    if (orderStatuses[normalizedStatus]) return orderStatuses[normalizedStatus];
    return DEFAULT_STATUS_CONFIG[normalizedStatus]?.label || status;
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter(order =>
      String(order.id).includes(query) ||
      order.customer_name?.toLowerCase().includes(query) ||
      order.customer_phone?.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  const fetchOrders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const response = await fetch('/api/orders');
      if (response.ok) {
        const data = await response.json();
        
        if (lastFetchTime && orders.length > 0) {
          const newIds = new Set<number>();
          data.forEach((order: Order) => {
            const orderDate = new Date(order.created_at);
            if (orderDate > lastFetchTime) {
              newIds.add(order.id);
            }
          });
          if (newIds.size > 0) {
            setNewOrderIds(prev => {
              const combined = new Set(Array.from(prev));
              newIds.forEach(id => combined.add(id));
              return combined;
            });
          }
        }

        setOrders(data);
        setLastFetchTime(new Date());
        if (data.length > 0 && !expandedOrder) {
          setExpandedOrder(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      if (showRefresh) {
        toast({ title: 'Ошибка', description: 'Не удалось обновить заказы', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lastFetchTime, orders.length, expandedOrder, toast]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const toggleOrder = (orderId: number) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
    setNewOrderIds(prev => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  };

  const copyOrderId = async (orderId: number) => {
    await navigator.clipboard.writeText(`#${orderId}`);
    setCopiedId(orderId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openTelegram = () => {
    const manager = config?.managerContact;
    if (manager) {
      const username = manager.startsWith('@') ? manager.slice(1) : manager;
      window.open(`https://t.me/${username}`, '_blank');
    }
  };

  const repeatOrder = async (order: Order) => {
    if (isRepeating) return;
    setIsRepeating(true);
    
    try {
      const productIds = order.items.map(item => String(item.product_id));
      
      const checkResponse = await fetch('/api/products/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds })
      });
      
      if (!checkResponse.ok) {
        throw new Error('Не удалось проверить товары');
      }
      
      const { existing, missing } = await checkResponse.json();
      
      if (existing.length === 0) {
        toast({
          title: 'Товары недоступны',
          description: 'К сожалению, все товары из этого заказа больше недоступны',
          variant: 'destructive',
        });
        return;
      }
      
      let addedCount = 0;
      const availableItems = order.items.filter(item => 
        existing.includes(String(item.product_id))
      );
      
      for (const item of availableItems) {
        for (let i = 0; i < item.quantity; i++) {
          addToCart(
            String(item.product_id), 
            item.selected_color, 
            item.selected_attributes
          );
          addedCount++;
        }
      }
      
      if (missing.length > 0) {
        toast({
          title: 'Часть товаров недоступна',
          description: `Добавлено ${availableItems.length} из ${order.items.length} товаров. ${missing.length} товар(ов) больше недоступны.`,
        });
      } else {
        toast({
          title: 'Товары добавлены в корзину',
          description: `${availableItems.length} товар(ов) из заказа #${order.id}`,
        });
      }
      
      navigate('/cart');
    } catch (error) {
      console.error('Error repeating order:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось добавить товары в корзину',
        variant: 'destructive',
      });
    } finally {
      setIsRepeating(false);
    }
  };

  const handlePullRefresh = () => {
    fetchOrders(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Загрузка заказов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">Мои заказы</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePullRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-4">
        {orders.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру заказа..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {orders.length === 0 ? (
          <Card className="p-8">
            <div className="text-center">
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Заказов пока нет</h2>
              <p className="text-muted-foreground mb-6">
                Ваши заказы появятся здесь после оформления
              </p>
              <Button onClick={() => navigate('/')}>
                Перейти к покупкам
              </Button>
            </div>
          </Card>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-8">
            <div className="text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Ничего не найдено</h2>
              <p className="text-muted-foreground">
                Попробуйте изменить поисковый запрос
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrder === order.id;
              const statusIndex = getStatusIndex(order.status);
              const isNew = newOrderIds.has(order.id);
              
              return (
                <Card 
                  key={order.id} 
                  className={`overflow-hidden transition-all duration-300 hover:shadow-lg border-border/60 ${isNew ? 'ring-2 ring-primary ring-offset-2' : ''} ${isExpanded ? 'shadow-md' : ''}`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleOrder(order.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyOrderId(order.id);
                            }}
                            className="text-sm font-mono font-medium text-foreground/70 hover:text-foreground flex items-center gap-1.5 transition-colors bg-muted/50 px-2 py-0.5 rounded-md"
                          >
                            #{order.id}
                            {copiedId === order.id ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                          <Badge variant="outline" className={`${getStatusColor(order.status)} font-medium`}>
                            {getStatusLabel(order.status)}
                          </Badge>
                          {isNew && (
                            <Badge className="bg-primary text-primary-foreground text-xs animate-pulse">
                              Новый
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeDate(order.created_at)}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatPrice(order.total)}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.length} {order.items.length === 1 ? 'товар' : order.items.length < 5 ? 'товара' : 'товаров'}
                          </p>
                        </div>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="p-1 rounded-full bg-muted/50"
                        >
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </div>

                    {!isExpanded && (
                      <div className="mt-3 space-y-3">
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {order.items.slice(0, 4).map((item, idx) => (
                            <div
                              key={idx}
                              className="flex-shrink-0 w-12 h-12 rounded-md bg-muted overflow-hidden"
                            >
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          ))}
                          {order.items.length > 4 && (
                            <div className="flex-shrink-0 w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                              <span className="text-xs text-muted-foreground">+{order.items.length - 4}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {order.delivery_address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{order.delivery_address}</span>
                            </div>
                          )}
                          {order.payment_method && (
                            <div className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              <span>{getPaymentMethodLabel(order.payment_method)}</span>
                            </div>
                          )}
                          {order.customer_phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span>{order.customer_phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <Separator />
                        <CardContent className="p-4 space-y-5">
                          {order.status !== 'cancelled' && statusSteps.length > 0 && (
                            <div className="bg-gradient-to-br from-muted/60 to-muted/30 rounded-xl p-4 border border-border/50">
                              <p className="text-sm font-medium mb-4 text-foreground/80">Статус заказа</p>
                              <div className="relative">
                                <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted-foreground/20" />
                                <div 
                                  className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500"
                                  style={{ width: `${(statusIndex / (statusSteps.length - 1)) * 100}%` }}
                                />
                                <div className="flex justify-between relative">
                                  {statusSteps.map((step, index) => {
                                    const Icon = step.icon;
                                    const isCompleted = index <= statusIndex;
                                    const isCurrent = index === statusIndex;
                                    
                                    return (
                                      <div key={step.key} className="flex flex-col items-center flex-1">
                                        <div
                                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                                            isCompleted
                                              ? 'bg-primary text-primary-foreground shadow-md'
                                              : 'bg-background border-2 border-muted-foreground/30 text-muted-foreground'
                                          } ${isCurrent ? 'ring-4 ring-primary/20 scale-110' : ''}`}
                                        >
                                          {isCompleted && index < statusIndex ? (
                                            <CheckCircle2 className="h-4 w-4" />
                                          ) : (
                                            <Icon className="h-4 w-4" />
                                          )}
                                        </div>
                                        <span className={`text-[9px] sm:text-[10px] mt-2 text-center leading-tight max-w-[50px] sm:max-w-[60px] ${isCompleted ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                                          {step.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {order.status === 'cancelled' && (
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                              </div>
                              <div>
                                <p className="font-medium text-red-800 dark:text-red-200">Заказ отменён</p>
                                <p className="text-sm text-red-600 dark:text-red-400">Свяжитесь с менеджером для уточнения</p>
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-sm font-medium mb-3">Товары</p>
                            <div className="space-y-3">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex gap-3">
                                  <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                                    {item.image_url ? (
                                      <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{item.name}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {item.selected_color && (
                                        <Badge variant="secondary" className="text-xs">
                                          {item.selected_color}
                                        </Badge>
                                      )}
                                      {item.selected_attributes && Object.entries(item.selected_attributes).map(([key, value]) => (
                                        <Badge key={key} variant="secondary" className="text-xs">
                                          {key}: {value}
                                        </Badge>
                                      ))}
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                      <span className="text-sm text-muted-foreground">
                                        {item.quantity} шт × {formatPrice(item.price)}
                                      </span>
                                      <span className="font-medium text-sm">
                                        {formatPrice(item.price * item.quantity)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <Separator />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Адрес доставки</p>
                                <p className="text-sm">{order.delivery_address || 'Не указан'}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Способ оплаты</p>
                                <p className="text-sm">{getPaymentMethodLabel(order.payment_method)}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Телефон</p>
                                <p className="text-sm">{order.customer_phone || 'Не указан'}</p>
                              </div>
                            </div>

                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Дата заказа</p>
                                <p className="text-sm">{formatDate(order.created_at)}</p>
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Итого:</span>
                            <span className="text-xl font-bold">{formatPrice(order.total)}</span>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={isRepeating}
                              onClick={(e) => {
                                e.stopPropagation();
                                repeatOrder(order);
                              }}
                            >
                              {isRepeating ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <ShoppingCart className="h-4 w-4 mr-2" />
                              )}
                              {isRepeating ? 'Добавляем...' : 'Повторить заказ'}
                            </Button>
                            
                            {config?.managerContact && (
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTelegram();
                                }}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Связаться
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
