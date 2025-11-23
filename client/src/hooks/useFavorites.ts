import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

interface FavoriteItem {
  id: string;
  name: string;
  price: number;
  images: string[];
  description?: string;
  category_id?: string;
}

export function useFavorites() {
  const { user } = useAuth();
  const userId = user?.id;

  // Fetch favorites
  const { data: favoriteItems = [], isLoading } = useQuery<FavoriteItem[]>({
    queryKey: ['/api/favorites', userId],
    queryFn: async () => {
      const response = await fetch(`/api/favorites/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch favorites');
      return response.json();
    },
    enabled: !!userId,
  });

  // Add to favorites mutation with optimistic update
  const addToFavorites = useMutation({
    mutationFn: async (productId: string) => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          product_id: productId,
        }),
      });
    },
    onMutate: async (productId: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/favorites', userId] });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(['/api/favorites', userId]);
      
      queryClient.setQueryData<FavoriteItem[]>(['/api/favorites', userId], (old = []) => {
        const exists = old.some(item => item.id === productId);
        if (exists) return old;
        
        const newItem: FavoriteItem = {
          id: productId,
          name: '',
          price: 0,
          images: [],
        };
        return [...old, newItem];
      });
      
      return { previousFavorites };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(['/api/favorites', userId], context.previousFavorites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/favorites', userId] });
    },
  });

  // Remove from favorites mutation with optimistic update
  const removeFromFavorites = useMutation({
    mutationFn: async (productId: string) => {
      if (!userId) throw new Error('User not authenticated');
      return apiRequest(`/api/favorites/${userId}/${productId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async (productId: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/favorites', userId] });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(['/api/favorites', userId]);
      
      queryClient.setQueryData<FavoriteItem[]>(['/api/favorites', userId], (old = []) => {
        return old.filter(item => item.id !== productId);
      });
      
      return { previousFavorites };
    },
    onError: (_err, _productId, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(['/api/favorites', userId], context.previousFavorites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/favorites', userId] });
    },
  });

  // Toggle favorite (add or remove)
  const toggleFavorite = (productId: string) => {
    const isFavorite = favoriteItems.some(item => item.id === productId);
    if (isFavorite) {
      removeFromFavorites.mutate(productId);
    } else {
      addToFavorites.mutate(productId);
    }
  };

  return {
    favoriteItems,
    isLoading,
    addToFavorites: addToFavorites.mutate,
    removeFromFavorites: removeFromFavorites.mutate,
    toggleFavorite,
    favoriteIds: favoriteItems.map(item => item.id),
    isAddingToFavorites: addToFavorites.isPending,
    isRemoving: removeFromFavorites.isPending,
  };
}
