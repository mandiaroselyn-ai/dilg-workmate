import React, { useEffect, useState } from 'react';
import { MARINDUQUE_MUNICIPALITIES } from '../../shared/marinduqueLocations';
import { OTHER_ADDRESS, joinHomeAddress, splitHomeAddress } from '../../shared/homeAddress';

// The home address as dropdowns: the town in Marinduque, then its barangay, then the house
// number and street, or Other to type an address outside the province. It sends the one-line
// address through `onChange` like a text input named `name`. The three fields take
// `labelClass` and `fieldClass` from the form they are in, which lays them out.
export default function AddressPicker({ name = 'address', value = '', onChange, required = false, labelClass, fieldClass }) {
  const [parts, setParts] = useState(() => splitHomeAddress(value));
  // An address from outside (another person's record, or the form cleared) replaces the parts.
  useEffect(() => {
    if (value !== joinHomeAddress(parts)) setParts(splitHomeAddress(value));
  }, [value]);

  const update = change => {
    const next = { ...parts, ...change };
    setParts(next);
    onChange({ target: { name, value: joinHomeAddress(next) } });
  };

  return (
    <>
      <label className={labelClass}>Town / Municipality
        <select value={parts.town} onChange={event => update({ town: event.target.value, barangay: '' })} required={required} className={fieldClass}>
          <option value="">Select town</option>
          {Object.keys(MARINDUQUE_MUNICIPALITIES).map(town => <option key={town} value={town}>{town}, Marinduque</option>)}
          <option value={OTHER_ADDRESS}>Outside Marinduque / other</option>
        </select>
      </label>
      {parts.town === OTHER_ADDRESS ? (
        <label className={labelClass}>Full Address
          <input value={parts.other} onChange={event => update({ other: event.target.value })} required maxLength={250} placeholder="House No., Street, Barangay, Town, Province" className={fieldClass} />
        </label>
      ) : (
        <>
          {/* Once a town is chosen, its barangay is needed. */}
          <label className={labelClass}>Barangay
            <select value={parts.barangay} onChange={event => update({ barangay: event.target.value })} required={Boolean(parts.town)} disabled={!parts.town} className={fieldClass}>
              <option value="">Select barangay</option>
              {(MARINDUQUE_MUNICIPALITIES[parts.town] || []).map(barangay => <option key={barangay} value={barangay}>{barangay}</option>)}
            </select>
          </label>
          <label className={labelClass}>House No. / Street
            <input value={parts.street} onChange={event => update({ street: event.target.value })} maxLength={120} placeholder="Optional" className={fieldClass} />
          </label>
        </>
      )}
    </>
  );
}
