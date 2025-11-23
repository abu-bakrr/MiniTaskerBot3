import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface RegisterProps {
  onLoginClick: () => void;
  onSuccess: () => void;
}

export default function Register({ onLoginClick, onSuccess }: RegisterProps) {
  const { register } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    telegram_username: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Ошибка',
        description: 'Пароли не совпадают',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: 'Ошибка',
        description: 'Пароль должен быть не менее 6 символов',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.telegram_username) {
      toast({
        title: 'Ошибка',
        description: 'Telegram username обязателен',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const result = await register({
      email: formData.email,
      password: formData.password,
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone,
      telegram_username: formData.telegram_username,
    });

    setLoading(false);

    if (result.success) {
      toast({
        title: 'Успешно',
        description: 'Регистрация выполнена',
      });
      onSuccess();
    } else {
      toast({
        title: 'Ошибка',
        description: result.error || 'Ошибка регистрации',
        variant: 'destructive',
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-lg p-6 sm:p-8 border border-card-border">
          <h1 className="text-2xl font-bold text-center mb-6">Регистрация</h1>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Имя *</label>
              <Input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
                placeholder="Введите имя"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Фамилия</label>
              <Input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                placeholder="Введите фамилию"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Email *</label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="example@email.com"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Телефон *</label>
              <Input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="+7 (999) 123-45-67"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Telegram username *</label>
              <Input
                type="text"
                name="telegram_username"
                value={formData.telegram_username}
                onChange={handleChange}
                required
                placeholder="@username"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Пароль *</label>
              <Input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Минимум 6 символов"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Подтвердите пароль *</label>
              <Input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Повторите пароль"
                className="w-full"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Уже есть аккаунт?{' '}
              <button
                onClick={onLoginClick}
                className="text-primary font-medium hover:underline"
              >
                Войти
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
