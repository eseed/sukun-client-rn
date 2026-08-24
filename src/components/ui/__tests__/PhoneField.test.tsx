import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { PhoneField } from '../PhoneField';
import { SUPPORTED_COUNTRIES } from '../../../lib/phone';
import { renderWithProviders } from '../../../test-utils';

function Harness() {
  const [country, setCountry] = useState<CountryCode>('EG' as CountryCode);
  const [national, setNational] = useState('');

  return (
    <PhoneField
      country={country}
      onCountryChange={setCountry}
      national={national}
      onNationalChange={setNational}
    />
  );
}

describe('PhoneField', () => {
  it('offers Egypt first, above the alphabetical run', () => {
    expect(SUPPORTED_COUNTRIES[0]?.code).toBe('EG');
    expect(SUPPORTED_COUNTRIES[1]?.code).not.toBe('EG');
  });

  it('never offers an excluded country', () => {
    expect(SUPPORTED_COUNTRIES.some((c) => c.code === 'IL')).toBe(false);
  });

  it('preselects Egypt and hints with a real Egyptian example number', () => {
    renderWithProviders(<Harness />);

    expect(screen.getByText(/🇪🇬 \+20/)).toBeTruthy();
    expect(screen.getByPlaceholderText('10 01234567')).toBeTruthy();
  });

  it('formats what is typed for the selected country', () => {
    renderWithProviders(<Harness />);

    const input = screen.getByPlaceholderText('10 01234567');
    fireEvent.changeText(input, '01012345678');

    expect(input.props.value).toBe('10 12345678');
  });

  it('opens the picker and switches the calling code', () => {
    renderWithProviders(<Harness />);

    fireEvent.press(screen.getByLabelText('Country: +20. Change'));
    fireEvent.changeText(screen.getByLabelText('Search country'), 'emirates');
    fireEvent.press(screen.getByLabelText('United Arab Emirates +971'));

    expect(screen.getByText(/🇦🇪 \+971/)).toBeTruthy();
  });

  it('clears digits typed under the previous country rather than reinterpreting them', () => {
    renderWithProviders(<Harness />);

    const input = screen.getByPlaceholderText('10 01234567');
    fireEvent.changeText(input, '1012345678');
    expect(input.props.value).toBe('10 12345678');

    fireEvent.press(screen.getByLabelText('Country: +20. Change'));
    fireEvent.changeText(screen.getByLabelText('Search country'), 'united states');
    fireEvent.press(screen.getByLabelText('United States +1'));

    expect(screen.getByPlaceholderText('201 555 0123').props.value).toBe('');
  });

  it('searches by name and by calling code', () => {
    renderWithProviders(<Harness />);

    fireEvent.press(screen.getByLabelText('Country: +20. Change'));
    const search = screen.getByLabelText('Search country');

    fireEvent.changeText(search, 'emirates');
    expect(screen.getByLabelText('United Arab Emirates +971')).toBeTruthy();
    expect(screen.queryByLabelText('United States +1')).toBeNull();

    fireEvent.changeText(search, '+971');
    expect(screen.getByLabelText('United Arab Emirates +971')).toBeTruthy();

    fireEvent.changeText(search, 'zzz');
    expect(screen.getByText('No country matches that.')).toBeTruthy();
  });
});
