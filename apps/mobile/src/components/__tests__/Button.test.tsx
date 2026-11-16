import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../ui/Button';
import { ThemeProvider } from '@/theme/ThemeProvider';

describe('<Button />', () => {
  it('llama a onPress y expone rol accesible', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <Button label="Iniciar viaje" onPress={onPress} />
      </ThemeProvider>,
    );
    const btn = screen.getByRole('button', { name: 'Iniciar viaje' });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('no dispara onPress mientras carga', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <Button label="Guardar" onPress={onPress} loading />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
