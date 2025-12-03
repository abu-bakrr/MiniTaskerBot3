import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Package, ChevronDown, ChevronUp, MapPin, CreditCard, Clock, CheckCircle2, Truck, PackageCheck, MessageCircle, Phone, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useConfig } from '@/hooks/useConfig';
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

const statusSteps = [
  { key: 'pending', label: 'Оформлен', icon: Clock },
  { key: 'processing', label: 'В обработке', icon: Package },
  { key: 'shipped', label: 'Отправлен', icon: Truck },
  { key: 'delivered', label: 'Доставлен', icon: PackageCheck },
];

const getStatusIndex = (status: string): number => {
  if (status === 'cancelled') return -1;
  const index = statusSteps.findIndex(s => s.key === status);
  return index >= 0 ? index : 0;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'shipped': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending': return 'Оформлен';
    case 'processing': return 'В обработке';
    case 'shipped': return 'Отправлен';
    case 'delivered': return 'Доставлен';
    case 'cancelled': return 'Отменён';
    default: return status;
  }
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

export default function Orders() {
  const [, navigate] = useLocation();
  const { config, formatPrice } = useConfig();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/orders');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
        if (data.length > 0) {
          setExpandedOrder(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrder = (orderId: number) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
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
          <h1 className="text-lg font-semibold">Мои заказы</h1>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6">
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
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedOrder === order.id;
              const statusIndex = getStatusIndex(order.status);
              
              return (
                <Card key={order.id} className="overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleOrder(order.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyOrderId(order.id);
                            }}
                            className="text-sm font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            #{order.id}
                            {copiedId === order.id ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                          <Badge variant="outline" className={getStatusColor(order.status)}>
                            {getStatusLabel(order.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{formatPrice(order.total)}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.length} {order.items.length === 1 ? 'товар' : 'товаров'}
                          </p>
                        </div>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </div>

                    {!isExpanded && (
                      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
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
                    )}
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Separator />
                        <CardContent className="p-4 space-y-5">
                          {order.status !== 'cancelled' && (
                            <div className="bg-muted/50 rounded-lg p-4">
                              <p className="text-sm font-medium mb-4">Статус заказа</p>
                              <div className="relative">
                                <div className="flex justify-between">
                                  {statusSteps.map((step, index) => {
                                    const Icon = step.icon;
                                    const isCompleted = index <= statusIndex;
                                    const isCurrent = index === statusIndex;
                                    
                                    return (
                                      <div key={step.key} className="flex flex-col items-center relative z-10">
                                        <div
                                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                            isCompleted
                                              ? 'bg-primary text-primary-foreground'
                                              : 'bg-muted-foreground/20 text-muted-foreground'
                                          } ${isCurrent ? 'ring-4 ring-primary/30' : ''}`}
                                        >
                                          {isCompleted && index < statusIndex ? (
                                            <CheckCircle2 className="h-5 w-5" />
                                          ) : (
                                            <Icon className="h-5 w-5" />
                                          )}
                                        </div>
                                        <span className={`text-xs mt-2 text-center ${isCompleted ? 'font-medium' : 'text-muted-foreground'}`}>
                                          {step.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted-foreground/20 -z-0">
                                  <div
                                    className="h-full bg-primary transition-all duration-500"
                                    style={{ width: `${(statusIndex / (statusSteps.length - 1)) * 100}%` }}
                                  />
                                </div>
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
                          </div>

                          <Separator />

                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Итого:</span>
                            <span className="text-xl font-bold">{formatPrice(order.total)}</span>
                          </div>

                          {config?.managerContact && (
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTelegram();
                              }}
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Связаться с менеджером
                            </Button>
                          )}
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
