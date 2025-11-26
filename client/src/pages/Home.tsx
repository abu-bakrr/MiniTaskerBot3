import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import ProductGrid from "@/components/ProductGrid";
import Pagination from "@/components/Pagination";
import { useConfig } from "@/hooks/useConfig";

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  category_id: string;
}

interface HomeProps {
  onCartClick: () => void;
  onFavoritesClick: () => void;
  onAccountClick: () => void;
  onProductClick: (id: string) => void;
  cartCount: number;
  favoritesCount: number;
  onAddToCart: (id: string) => void;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSort, setSelectedSort] = useState("new");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Get categories from config
  const { config } = useConfig();
  const categories = config?.categories || [];

  // Fetch products from API
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedSort("new");
    setPriceFrom("");
    setPriceTo("");
    setSearchQuery("");
    setCurrentPage(1);
  };

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
        onCategoryChange={setSelectedCategory}
        onSortChange={setSelectedSort}
        onPriceFromChange={setPriceFrom}
        onPriceToChange={setPriceTo}
        onSearchChange={setSearchQuery}
        onReset={handleResetFilters}
      />

      {isLoadingProducts ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Загрузка товаров...</p>
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
          />

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
