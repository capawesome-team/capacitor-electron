import { CapacitorException, ExceptionCode } from '@capacitor/core';

class Echo {
  constructor(context) {
    this.context = context;
  }
  async echo(options) {
    return { value: options ? options.value : null };
  }
  async ping(options) {
    this.context.notifyListeners('ping', {
      echoed: options ? options.value : null,
    });
    return { ok: true };
  }
  async fail() {
    throw new CapacitorException(
      'This method always fails.',
      ExceptionCode.Unavailable,
    );
  }
}
Echo.__capacitorElectronPlugin = {
  name: 'Echo',
  methods: ['echo', 'ping', 'fail'],
};

export { Echo };
