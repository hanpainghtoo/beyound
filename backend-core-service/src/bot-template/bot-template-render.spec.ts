import { renderMenuRows } from './bot-template-render';

describe('bot-template-render', () => {
  const fields = [
    {
      key: 'greeting',
      sort: 0,
      layout: 'full',
      visible: true,
      condition: null,
      value: {},
    },
    {
      key: 'products',
      sort: 1,
      layout: 'full',
      visible: true,
      condition: null,
      value: {},
    },
    {
      key: 'shop_info',
      sort: 2,
      layout: 'half',
      visible: true,
      condition: null,
      value: {},
    },
    {
      key: 'orders',
      sort: 3,
      layout: 'half',
      visible: true,
      condition: 'requires_ordering',
      value: {},
    },
    {
      key: 'agent',
      sort: 4,
      layout: 'full',
      visible: true,
      condition: null,
      value: {},
    },
  ];

  it('pairs halves and isolates fulls', () => {
    const rows = renderMenuRows(fields, { orderingEnabled: true });
    expect(rows.map((row) => row.map((button) => button.key))).toEqual([
      ['products'],
      ['shop_info', 'orders'],
      ['agent'],
    ]);
  });

  it('hides the orders button when ordering is off', () => {
    const rows = renderMenuRows(fields, { orderingEnabled: false });
    expect(rows.map((row) => row.map((button) => button.key))).toEqual([
      ['products'],
      ['shop_info'],
      ['agent'],
    ]);
  });

  it('skips hidden fields and never renders greeting as a button', () => {
    const rows = renderMenuRows(
      fields.map((field) =>
        field.key === 'shop_info' ? { ...field, visible: false } : field,
      ),
      { orderingEnabled: true },
    );
    expect(rows.flat().map((button) => button.key)).not.toContain('greeting');
    expect(rows.flat().map((button) => button.key)).not.toContain('shop_info');
  });

  it('stands a trailing odd half alone', () => {
    const rows = renderMenuRows(
      [
        {
          key: 'products',
          sort: 0,
          layout: 'half',
          visible: true,
          condition: null,
          value: {},
        },
        {
          key: 'agent',
          sort: 1,
          layout: 'half',
          visible: true,
          condition: null,
          value: {},
        },
        {
          key: 'orders',
          sort: 2,
          layout: 'half',
          visible: true,
          condition: null,
          value: {},
        },
      ],
      { orderingEnabled: true },
    );
    expect(rows.map((row) => row.map((button) => button.key))).toEqual([
      ['products', 'agent'],
      ['orders'],
    ]);
  });

  it('prefers custom labels and falls back to null', () => {
    const rows = renderMenuRows(
      [
        {
          key: 'products',
          sort: 0,
          layout: 'full',
          visible: true,
          condition: null,
          value: { label: 'Catalog' },
        },
        {
          key: 'agent',
          sort: 1,
          layout: 'full',
          visible: true,
          condition: null,
          value: {},
        },
      ],
      { orderingEnabled: true },
    );
    expect(rows[0][0]).toEqual({ key: 'products', label: 'Catalog' });
    expect(rows[1][0]).toEqual({ key: 'agent', label: null });
  });

  it('packs three thirds into one row', () => {
    const rows = renderMenuRows(
      ['products', 'shop_info', 'orders'].map((key, index) => ({
        key,
        sort: index,
        layout: 'third',
        visible: true,
        condition: null,
        value: {},
      })),
      { orderingEnabled: true },
    );
    expect(rows.map((row) => row.map((button) => button.key))).toEqual([
      ['products', 'shop_info', 'orders'],
    ]);
  });

  it('greedily packs mixed spans', () => {
    const rows = renderMenuRows(
      [
        { key: 'products', sort: 0, layout: 'half' },
        { key: 'shop_info', sort: 1, layout: 'third' },
        { key: 'orders', sort: 2, layout: 'third' },
        { key: 'agent', sort: 3, layout: 'full' },
      ].map((field) => ({
        ...field,
        visible: true,
        condition: null,
        value: {},
      })),
      { orderingEnabled: true },
    );
    expect(rows.map((row) => row.map((button) => button.key))).toEqual([
      ['products', 'shop_info'],
      ['orders'],
      ['agent'],
    ]);
  });
});
