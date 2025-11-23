import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

interface CartItem {
  id: string;
  cart_id?: string;
  name: string;
  price: number;
  images: string[];
  quantity: number;
  product_id: string;
  selected_color?: string;
  selected_attributes?: Record<string, string>;
}

export function useCart() {
  const { user } = useAuth();
  const userId = user?.id;

  // Fetch cart items
  const { data: cartItems = [], isLoading } = useQuery<CartItem[]>({
    queryKey: ['/api/cart', userId],
    queryFn: async () => {
      const response = await fetch(`/api/cart/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch cart');
      return response.json();
    },
    enabled: !!userId,
  });

  // Add to cart mutation with optimistic update
  const addToCart = useMutation({
    mutationFn: async ({ productId, selectedColor, selectedAttributes }: { 
      productId: string; 
      selectedColor?: string; 
      selectedAttributes?: Record<string, string>
    }) => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest('/api/cart', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          product_id: productId,
          quantity: 1,
          selected_color: selectedColor,
          selected_attributes: selectedAttributes,
        }),
      });
    },
    onMutate: async ({ productId, selectedColor, selectedAttributes }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/cart', userId] });
      const previousCart = queryClient.getQueryData<CartItem[]>(['/api/cart', userId]);
      
      queryClient.setQueryData<CartItem[]>(['/api/cart', userId], (old = []) => {
        const newItem: CartItem = {
          id: productId,
          product_id: productId,
          name: '',
          price: 0,
          images: [],
          quantity: 1,
          selected_color: selectedColor,
          selected_attributes: selectedAttributes,
        };
        return [...old, newItem];
      });
      
      return { previousCart };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['/api/cart', userId], context.previousCart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart', userId] });
    },
  });

  // Update quantity mutation with optimistic update
  const updateQuantity = useMutation({
    mutationFn: async ({ cartId, productId, quantity }: { cartId?: string; productId?: string; quantity: number }) => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({
          cart_id: cartId,
          user_id: userId,
          product_id: productId,
          quantity,
        }),
      });
    },
    onMutate: async ({ productId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/cart', userId] });
      const previousCart = queryClient.getQueryData<CartItem[]>(['/api/cart', userId]);
      
      queryClient.setQueryData<CartItem[]>(['/api/cart', userId], (old = []) => {
        return old.map(item =>
          item.id === productId ? { ...item, quantity } : item
        );
      });
      
      return { previousCart };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['/api/cart', userId], context.previousCart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart', userId] });
    },
  });

  // Remove from cart mutation with optimistic update
  const removeFromCart = useMutation({
    mutationFn: async (cartId: string) => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest(`/api/cart/${cartId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async (cartId: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/cart', userId] });
      const previousCart = queryClient.getQueryData<CartItem[]>(['/api/cart', userId]);
      
      queryClient.setQueryData<CartItem[]>(['/api/cart', userId], (old = []) => {
        return old.filter(item => item.cart_id !== cartId);
      });
      
      return { previousCart };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['/api/cart', userId], context.previousCart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart', userId] });
    },
  });

  // Clear cart mutation with optimistic update
  const clearCart = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest(`/api/cart/${userId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['/api/cart', userId] });
      const previousCart = queryClient.getQueryData<CartItem[]>(['/api/cart', userId]);
      
      queryClient.setQueryData<CartItem[]>(['/api/cart', userId], []);
      
      return { previousCart };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['/api/cart', userId], context.previousCart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart', userId] });
    },
  });

  return {
    cartItems,
    isLoading,
    addToCart: (productId: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => 
      addToCart.mutate({ productId, selectedColor, selectedAttributes }),
    updateQuantity: updateQuantity.mutate,
    removeFromCart: removeFromCart.mutate,
    clearCart: clearCart.mutate,
    isAddingToCart: addToCart.isPending,
    isUpdating: updateQuantity.isPending,
    isRemoving: removeFromCart.isPending,
  };
}
