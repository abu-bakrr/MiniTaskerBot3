import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Trash2, Shield, Crown, Search, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Admin {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_admin: boolean;
  is_superadmin: boolean;
  created_at: string;
}

interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
}

export default function AdminManagers() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(true);

  useEffect(() => {
    loadAdmins();
    loadUsers();
  }, []);

  const loadAdmins = async () => {
    try {
      const response = await fetch('/api/admin/admins');
      if (response.status === 403) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error('Failed to load admins');
      const data = await response.json();
      setAdmins(data);
    } catch (err) {
      setError('Ошибка загрузки списка администраторов');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/admins/users');
      if (!response.ok) return;
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const handleAddAdmin = async () => {
    if (!selectedUserId) {
      setError('Выберите пользователя');
      return;
    }

    try {
      const response = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(selectedUserId) })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add admin');
      }

      setSuccess('Администратор успешно добавлен');
      setShowAddDialog(false);
      setSelectedUserId('');
      loadAdmins();
      loadUsers();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка добавления администратора');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleRemoveAdmin = async (adminId: number) => {
    if (!confirm('Вы уверены, что хотите удалить права администратора у этого пользователя?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/admins/${adminId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove admin');
      }

      setSuccess('Права администратора удалены');
      loadAdmins();
      loadUsers();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления администратора');
      setTimeout(() => setError(''), 5000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Только главный администратор может управлять другими администраторами.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 flex-shrink-0" />
                <span className="break-words">Управление администраторами</span>
              </CardTitle>
              <CardDescription className="mt-1">
                Добавляйте и удаляйте администраторов вашего магазина
              </CardDescription>
            </div>

            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto flex-shrink-0">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Добавить админа
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Добавить администратора</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Поиск пользователя</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Поиск по email или имени..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Выберите пользователя</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Выберите пользователя..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUsers.length === 0 ? (
                          <div className="py-4 text-center text-sm text-muted-foreground">
                            {searchTerm ? 'Пользователи не найдены' : 'Нет доступных пользователей'}
                          </div>
                        ) : (
                          filteredUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                              <div className="flex flex-col">
                                <span>{user.email}</span>
                                {(user.first_name || user.last_name) && (
                                  <span className="text-xs text-muted-foreground">
                                    {[user.first_name, user.last_name].filter(Boolean).join(' ')}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => {
                      setShowAddDialog(false);
                      setSelectedUserId('');
                      setSearchTerm('');
                    }}>
                      Отмена
                    </Button>
                    <Button className="flex-1" onClick={handleAddAdmin} disabled={!selectedUserId}>
                      Добавить
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет администраторов
            </div>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg bg-card"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {admin.is_superadmin ? (
                        <Crown className="h-5 w-5 text-primary" />
                      ) : (
                        <Shield className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium break-all">{admin.email}</span>
                        {admin.is_superadmin && (
                          <Badge variant="default" className="bg-primary flex-shrink-0">
                            Главный
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {[admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'Имя не указано'}
                        {admin.phone && ` • ${admin.phone}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Добавлен: {formatDate(admin.created_at)}
                      </div>
                    </div>
                  </div>

                  {!admin.is_superadmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 self-end sm:self-auto flex-shrink-0"
                      onClick={() => handleRemoveAdmin(admin.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
