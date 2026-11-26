import {
  validateAckPayload,
  validateEventPayload,
  validateTelemetryPayload,
} from './mqtt-payloads';

describe('MQTT Payload Validators', () => {
  describe('validateTelemetryPayload', () => {
    it('accepts valid telemetry JSON matching topic deviceId', () => {
      const result = validateTelemetryPayload(
        {
          deviceId: 'smartroom-01',
          temperature: 28.4,
          distance: 24.5,
          fan: true,
          led: true,
          doorUnlocked: false,
          buzzer: false,
        },
        'smartroom-01',
      );
      expect(result).toEqual({
        deviceId: 'smartroom-01',
        temperature: 28.4,
        distance: 24.5,
        fan: true,
        led: true,
        doorUnlocked: false,
        buzzer: false,
        firmwareVersion: undefined,
      });
    });

    it('rejects out-of-range temperature, missing booleans, and mismatched deviceId', () => {
      expect(
        validateTelemetryPayload(
          {
            deviceId: 'smartroom-01',
            temperature: 999,
            distance: 10,
            fan: true,
            led: false,
            doorUnlocked: false,
            buzzer: false,
          },
          'smartroom-01',
        ),
      ).toBeNull();

      expect(
        validateTelemetryPayload(
          {
            deviceId: 'other-device',
            temperature: 25,
            distance: 10,
            fan: true,
            led: false,
            doorUnlocked: false,
            buzzer: false,
          },
          'smartroom-01',
        ),
      ).toBeNull();

      expect(
        validateTelemetryPayload(
          {
            deviceId: 'smartroom-01',
            temperature: '25',
            distance: 10,
            fan: 'yes',
            led: false,
            doorUnlocked: false,
            buzzer: false,
          },
          'smartroom-01',
        ),
      ).toBeNull();
    });
  });

  describe('validateEventPayload', () => {
    it('accepts valid security event payloads and normalizes event name', () => {
      const result = validateEventPayload(
        {
          eventId: 'evt-123',
          deviceId: 'smartroom-01',
          event: 'wrong_password',
          severity: 'HIGH',
          message: 'Incorrect keypad password detected',
        },
        'smartroom-01',
      );
      expect(result).toEqual({
        eventId: 'evt-123',
        deviceId: 'smartroom-01',
        event: 'WRONG_PASSWORD',
        severity: 'HIGH',
        message: 'Incorrect keypad password detected',
      });
    });

    it('rejects payloads missing event field or mismatching deviceId', () => {
      expect(validateEventPayload({ deviceId: 'smartroom-01' }, 'smartroom-01')).toBeNull();
      expect(
        validateEventPayload({ deviceId: 'smartroom-99', event: 'WRONG_PASSWORD' }, 'smartroom-01'),
      ).toBeNull();
    });
  });

  describe('validateAckPayload', () => {
    it('accepts valid command acknowledgment', () => {
      expect(
        validateAckPayload({
          commandId: 'cmd-1',
          action: 'UNLOCK',
          success: true,
          doorUnlocked: true,
        }),
      ).toEqual({
        commandId: 'cmd-1',
        action: 'UNLOCK',
        success: true,
        doorUnlocked: true,
        reason: undefined,
      });
    });

    it('rejects malformed ACK actions or missing fields', () => {
      expect(
        validateAckPayload({
          commandId: 'cmd-1',
          action: 'REBOOT',
          success: true,
          doorUnlocked: false,
        }),
      ).toBeNull();
      expect(validateAckPayload({ commandId: '', action: 'LOCK', success: true, doorUnlocked: false })).toBeNull();
    });
  });
});
