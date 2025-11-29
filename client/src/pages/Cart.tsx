import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CartItem from "@/components/CartItem";
import CheckoutModal from "@/components/CheckoutModal";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useConfig } from "@/hooks/useConfig";
import { useToast } from "@/hooks/use-toast";

interface CartItemData {
  id: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
  selected_color?: string;
  selected_attributes?: Record<string, string>;
}

interface CartProps {
  items: CartItemData[];
  onBack: () => void;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
}

interface DeliveryInfo {
  address: string;
  lat: number | null;
  lng: number | null;
  customerName: string;
  customerPhone: string;
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
  const { toast } = useToast();

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const orderItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    selected_color: item.selected_color,
    selected_attributes: item.selected_attributes,
  }));

  const handleCheckout = () => {
    setIsModalOpen(true);
  };

  const handlePaymentSelect = async (paymentMethod: string, deliveryInfo: DeliveryInfo, receiptUrl?: string): Promise<string | null> => {
    if (!user?.id) {
      console.error('User ID not available');
      toast({
        title: "Ошибка",
        description: "Необходимо авторизоваться",
        variant: "destructive",
      });
      return null;
    }

    try {
      const response = await apiRequest('/api/orders/checkout', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          items: orderItems,
          total: total,
          payment_method: paymentMethod,
          delivery_address: deliveryInfo.address,
          delivery_lat: deliveryInfo.lat,
          delivery_lng: deliveryInfo.lng,
          customer_name: deliveryInfo.customerName,
          customer_phone: deliveryInfo.customerPhone,
          payment_receipt_url: receiptUrl,
        }),
      });

      if (response.payment_url) {
        onClearCart();
        return response.payment_url;
      } else if (response.order_id) {
        onClearCart();
        if (paymentMethod !== 'card_transfer') {
          toast({
            title: "Заказ создан",
            description: `Номер заказа: ${response.order_id}`,
          });
          setIsModalOpen(false);
        }
        return null;
      }

      return null;
    } catch (error) {
      console.error('Failed to create order:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать заказ",
        variant: "destructive",
      });
      return null;
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

            <div className="sticky bottom-0 z-40 bg-background border-t border-border pt-4 pb-6">
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

      <CheckoutModal
        isOpen={isModalOpen}
        items={orderItems}
        total={total}
        onClose={() => setIsModalOpen(false)}
        onPaymentSelect={handlePaymentSelect}
      />
    </div>
  );
}
