import { parseFromWeb } from '../map/map-protocol';

describe('parseFromWeb', () => {
  it('acepta mensajes conocidos', () => {
    expect(parseFromWeb(JSON.stringify({ type: 'tap', coord: [-100.39, 20.58] }))).toEqual({ type: 'tap', coord: [-100.39, 20.58] });
  });
  it('rechaza tipos desconocidos, JSON inválido y no-objetos', () => {
    expect(parseFromWeb(JSON.stringify({ type: 'eval', code: 'x' }))).toBeNull();
    expect(parseFromWeb('{no json')).toBeNull();
    expect(parseFromWeb('42')).toBeNull();
  });
});
