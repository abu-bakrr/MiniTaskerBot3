import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Package, FolderOpen, ShoppingCart, BarChart3, Settings, LogOut, Users } from 'lucide-react';
import AdminProducts from './AdminProducts';
import AdminCategories from './AdminCategories';
import AdminOrders from './AdminOrders';
import AdminStatistics from './AdminStatistics';
import AdminSettings from './AdminSettings';
import AdminManagers from './AdminManagers';

export default function AdminLayout() {
  const [activeTab, setActiveTab] = useState('products');
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/me');
      if (!response.ok) {
        setLocation('/admin/login');
        return;
      }
      const data = await response.json();
      setAdmin(data.user);
    } catch (error) {
      setLocation('/admin/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setLocation('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Админ-панель</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {admin?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-hidden">
          <div className="overflow-x-auto -mx-2 px-2 mb-6">
            <TabsList className="inline-flex w-max min-w-full sm:w-full sm:grid sm:grid-cols-5 lg:grid-cols-6 gap-1">
              <TabsTrigger value="products" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Package className="h-4 w-4 flex-shrink-0" />
                <span>Товары</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                <span>Категории</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                <span>Заказы</span>
              </TabsTrigger>
              <TabsTrigger value="statistics" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <BarChart3 className="h-4 w-4 flex-shrink-0" />
                <span>Статистика</span>
              </TabsTrigger>
              {admin?.is_superadmin && (
                <TabsTrigger value="managers" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span>Админы</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="settings" className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span>Настройки</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {activeTab === 'products' && <AdminProducts />}
          {activeTab === 'categories' && <AdminCategories />}
          {activeTab === 'orders' && <AdminOrders />}
          {activeTab === 'statistics' && <AdminStatistics />}
          {activeTab === 'managers' && admin?.is_superadmin && <AdminManagers />}
          {activeTab === 'settings' && <AdminSettings />}
        </Tabs>
      </div>
    </div>
  );
}
