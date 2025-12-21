import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import ProductGrid from "@/components/ProductGrid";
import Pagination from "@/components/Pagination";
import SEO, { ShopSchema } from "@/components/SEO";
import { useConfig } from "@/hooks/useConfig";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  category_id: string;
}

interface Category {
  id: string;
  name: string;
  icon?: string;
}

interface AvailabilityData {
  status: 'in_stock' | 'backorder' | 'not_tracked';
  in_stock: boolean;
  total_quantity: number;
  backorder_lead_time_days: number | null;
}

interface HomeProps {
  onCartClick: () => void;
  onFavoritesClick: () => void;
  onAccountClick: () => void;
  onProductClick: (id: string) => void;
  cartCount: number;
  favoritesCount: number;
  onAddToCart: (id: string, selectedColor?: string, selectedAttributes?: Record<string, string>) => void;
  onToggleFavorite: (id: string) => void;
  favoriteIds: string[];
  cartItemIds: string[];
}

export default function Home({
  onCartClick,
  onFavoritesClick,
  onAccountClick,
  onProductClick,
  cartCount,
  favoritesCount,
  onAddToCart,
  onToggleFavorite,
  favoriteIds,
  cartItemIds,
}: HomeProps) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { config } = useConfig();
  
  // Parse URL parameters
  const getUrlParams = useCallback(() => {
    const params = new URLSearchParams(searchString);
    return {
      category: params.get('category') || 'all',
      sort: params.get('sort') || 'new',
      priceFrom: params.get('priceFrom') || '',
      priceTo: params.get('priceTo') || '',
      search: params.get('search') || '',
      page: parseInt(params.get('page') || '1', 10),
    };
  }, [searchString]);
  
  const urlParams = getUrlParams();
  
  const [currentPage, setCurrentPage] = useState(urlParams.page);
  const [selectedCategory, setSelectedCategory] = useState(urlParams.category);
  const [selectedSort, setSelectedSort] = useState(urlParams.sort);
  const [priceFrom, setPriceFrom] = useState(urlParams.priceFrom);
  const [priceTo, setPriceTo] = useState(urlParams.priceTo);
  const [searchQuery, setSearchQuery] = useState(urlParams.search);
  
  // Update URL when filters change
  const updateUrl = useCallback((updates: Record<string, string | number>) => {
    const params = new URLSearchParams(searchString);
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all' && value !== 'new' && value !== '' && value !== 1) {
        params.set(key, String(value));
      } else {
        params.delete(key);
      }
    });
    
    const newSearch = params.toString();
    const newUrl = newSearch ? `/?${newSearch}` : '/';
    setLocation(newUrl, { replace: true });
  }, [searchString, setLocation]);
  
  // Sync state from URL on mount
  useEffect(() => {
    const params = getUrlParams();
    setCurrentPage(params.page);
    setSelectedCategory(params.category);
    setSelectedSort(params.sort);
    setPriceFrom(params.priceFrom);
    setPriceTo(params.priceTo);
    setSearchQuery(params.search);
  }, [searchString]);
  
  // Handlers that update both state and URL
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
    updateUrl({ category: value, page: 1, sort: selectedSort, priceFrom, priceTo, search: searchQuery });
  };
  
  const handleSortChange = (value: string) => {
    setSelectedSort(value);
    setCurrentPage(1);
    updateUrl({ sort: value, page: 1, category: selectedCategory, priceFrom, priceTo, search: searchQuery });
  };
  
  const handlePriceFromChange = (value: string) => {
    setPriceFrom(value);
    setCurrentPage(1);
    updateUrl({ priceFrom: value, page: 1, category: selectedCategory, sort: selectedSort, priceTo, search: searchQuery });
  };
  
  const handlePriceToChange = (value: string) => {
    setPriceTo(value);
    setCurrentPage(1);
    updateUrl({ priceTo: value, page: 1, category: selectedCategory, sort: selectedSort, priceFrom, search: searchQuery });
  };
  
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    updateUrl({ search: value, page: 1, category: selectedCategory, sort: selectedSort, priceFrom, priceTo });
  };
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    updateUrl({ page, category: selectedCategory, sort: selectedSort, priceFrom, priceTo, search: searchQuery });
  };

  // Fetch categories from database API
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Fetch products from API
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch availability data for all products
  const productIds = products.map(p => p.id);
  const { data: availabilityData = {} } = useQuery<Record<string, AvailabilityData>>({
    queryKey: ["/api/products/availability", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return {};
      const response = await fetch("/api/products/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: productIds }),
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: productIds.length > 0,
  });

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedSort("new");
    setPriceFrom("");
    setPriceTo("");
    setSearchQuery("");
    setCurrentPage(1);
    setLocation('/', { replace: true });
  };
  
  // Check if any filters are active
  const hasActiveFilters = selectedCategory !== 'all' || selectedSort !== 'new' || priceFrom !== '' || priceTo !== '' || searchQuery !== '';

  const productsPerPage = 12;
  
  // Apply filtering and sorting with useMemo for performance
  const { filteredProducts, totalPages, displayedProducts } = useMemo(() => {
    let filtered = [...products];
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        product => product.name.toLowerCase().includes(query)
      );
    }
    
    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        product => product.category_id === selectedCategory
      );
    }
    
    // Filter by price range
    const minPrice = priceFrom ? parseFloat(priceFrom) : 0;
    const maxPrice = priceTo ? parseFloat(priceTo) : Infinity;
    
    if (priceFrom || priceTo) {
      filtered = filtered.filter(
        product => product.price >= minPrice && product.price <= maxPrice
      );
    }
    
    // Apply sorting
    switch (selectedSort) {
      case 'new':
        // Keep original order (newest first)
        break;
      case 'old':
        filtered = [...filtered].reverse();
        break;
      case 'price-asc':
        filtered = [...filtered].sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        filtered = [...filtered].sort((a, b) => b.price - a.price);
        break;
    }
    
    const pages = Math.ceil(filtered.length / productsPerPage);
    const startIndex = (currentPage - 1) * productsPerPage;
    const displayed = filtered.slice(startIndex, startIndex + productsPerPage);
    
    return {
      filteredProducts: filtered,
      totalPages: pages,
      displayedProducts: displayed
    };
  }, [products, searchQuery, selectedCategory, priceFrom, priceTo, selectedSort, currentPage]);

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title={config?.seo?.title || config?.shopName}
        description={config?.seo?.description || config?.description}
        image={config?.logo}
        type="website"
      />
      <ShopSchema />
      <Header
        onCartClick={onCartClick}
        onFavoritesClick={onFavoritesClick}
        onAccountClick={onAccountClick}
        cartCount={cartCount}
        favoritesCount={favoritesCount}
      />
      
      <FilterBar
        categories={categories}
        selectedCategory={selectedCategory}
        selectedSort={selectedSort}
        priceFrom={priceFrom}
        priceTo={priceTo}
        searchQuery={searchQuery}
        products={products}
        isLoadingProducts={isLoadingProducts}
        onCategoryChange={handleCategoryChange}
        onSortChange={handleSortChange}
        onPriceFromChange={handlePriceFromChange}
        onPriceToChange={handlePriceToChange}
        onSearchChange={handleSearchChange}
        onProductClick={onProductClick}
        onReset={handleResetFilters}
      />

      {isLoadingProducts ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Загрузка товаров...</p>
        </div>
      ) : filteredProducts.length === 0 && hasActiveFilters ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2 text-center">Ничего не найдено</h2>
          <p className="text-muted-foreground text-center mb-6">
            По вашему запросу товары не найдены. Попробуйте изменить параметры поиска.
          </p>
          <Button onClick={handleResetFilters} variant="outline">
            Сбросить фильтры
          </Button>
        </div>
      ) : (
        <>
          <ProductGrid
            products={displayedProducts}
            onToggleFavorite={onToggleFavorite}
            onAddToCart={onAddToCart}
            onProductClick={onProductClick}
            favoriteIds={favoriteIds}
            cartItemIds={cartItemIds}
            onCartClick={onCartClick}
            availabilityData={availabilityData}
          />

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
