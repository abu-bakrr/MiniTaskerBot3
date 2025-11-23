import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, Package, LogOut } from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';

interface Order {
  id: string;
  total: number;
  status: string;
  created_at: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    selected_color?: string;
    selected_attributes?: any;
  }>;
}

export default function ProfileDropdown() {
  const { user, logout } = useAuth();
  const { config } = useConfig();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const formatPrice = (price: number) => {
    const formattedPrice = (price / 100).toFixed(2);
    const currencySymbol = config?.currency?.symbol || '₽';
    const currencyPosition = config?.currency?.position || 'after';
    
    return currencyPosition === 'before' 
      ? `${currencySymbol}${formattedPrice}`
      : `${formattedPrice} ${currencySymbol}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const loadOrders = async () => {
    if (!user?.id) return;
    
    setLoadingOrders(true);
    try {
      const response = await fetch('/api/orders', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
  };

  if (!user) return null;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <User className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="pb-3">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mx-2 my-2">
            <TabsTrigger value="info">Профиль</TabsTrigger>
            <TabsTrigger value="orders">Мои заказы</TabsTrigger>
          </TabsList>
          
          <TabsContent value="info" className="px-2 pb-2">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Имя</p>
                <p className="font-medium">{fullName}</p>
              </div>
              
              <div>
                <p className="text-muted-foreground text-xs mb-1">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              
              {user.phone && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Телефон</p>
                  <p className="font-medium">{user.phone}</p>
                </div>
              )}
              
              {user.telegram_username && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Telegram</p>
                  <p className="font-medium">{user.telegram_username}</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="orders" className="px-2 pb-2">
            <ScrollArea className="h-[300px]">
              {loadingOrders ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-muted-foreground">Загрузка...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Package className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Заказов пока нет</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div key={order.id} className="border border-border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(order.created_at)}
                          </p>
                          <p className="text-sm font-medium mt-0.5">
                            {formatPrice(order.total)}
                          </p>
                        </div>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          {order.status === 'pending' ? 'В обработке' : order.status}
                        </span>
                      </div>
                      
                      <div className="space-y-1.5">
                        {order.items.map((item, index) => (
                          <div key={index} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{item.name}</span>
                            {item.selected_color && (
                              <span className="ml-1">• {item.selected_color}</span>
                            )}
                            <span className="ml-1">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Выйти</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
