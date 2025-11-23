import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CartItem from "@/components/CartItem";
import OrderModal from "@/components/OrderModal";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useConfig } from "@/hooks/useConfig";

interface CartItemData {
  id: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
}

interface CartProps {
  items: CartItemData[];
  onBack: () => void;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
}

export default function Cart({
  items,
  onBack,
  onQuantityChange,
  onRemoveItem,
  onClearCart,
}: CartProps) {
  const { formatPrice } = useConfig();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const orderItems = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  }));

  const handleCheckout = () => {
    setIsModalOpen(true);
  };

  const handleOrderComplete = async () => {
    if (!user?.id) {
      console.error('User ID not available');
      return;
    }

    try {
      console.log('Sending order:', { user_id: user.id, items: orderItems, total });
      await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          items: orderItems,
          total: total,
        }),
      });
      console.log('Order sent successfully');
      onClearCart();
    } catch (error) {
      console.error('Failed to create order:', error);
      onClearCart();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b border-border px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={onBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold">Корзина</h1>
          </div>
          
          {items.length > 0 && (
            <Button
              variant="ghost"
              onClick={onClearCart}
              className="text-destructive"
              data-testid="button-clear-cart"
            >
              Очистить
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🛒</div>
            <p className="text-muted-foreground">Корзина пуста</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {items.map((item) => (
                <CartItem
                  key={item.id}
                  {...item}
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemoveItem}
                />
              ))}
            </div>

            <div className="sticky bottom-0 bg-background border-t border-border pt-4 pb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-semibold">Итого:</span>
                <span className="text-2xl font-bold text-primary" data-testid="text-cart-total">
                  {formatPrice(total)}
                </span>
              </div>
              
              <Button
                onClick={handleCheckout}
                className="w-full"
                data-testid="button-checkout"
              >
                Оформить заказ
              </Button>
            </div>
          </>
        )}
      </div>

      <OrderModal
        isOpen={isModalOpen}
        items={orderItems}
        total={total}
        onClose={() => setIsModalOpen(false)}
        onOrderComplete={handleOrderComplete}
      />
    </div>
  );
}
