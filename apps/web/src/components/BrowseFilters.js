// Keep the native selects as the filter state; enhance their presentation.
const controls = [];

export function syncBrowseFilters() {
  controls.forEach(({ select, trigger, value, items }) => {
    value.textContent = select.selectedOptions[0]?.textContent || (select.id === 'browse-genre-select' ? 'Nhiều thể loại' : 'Tất cả');
    trigger.classList.toggle('has-value', Boolean(select.value) && select.value !== 'year');
    items.forEach(({ option, button }) => {
      button.setAttribute('aria-pressed', String(option.selected));
    });
  });
}

export function initBrowseFilters() {
  if (controls.length) return;
  const names = ['Thể loại', 'Năm phát hành', 'Trạng thái', 'Sắp xếp'];
  const closeAll = () => controls.forEach(control => control.close());
  document.querySelectorAll('#browse-filter-form select').forEach((select, index) => {
    const field = document.createElement('div');
    field.className = 'browse-filter-field';
    const label = document.createElement('span');
    label.className = 'browse-filter-label';
    label.id = select.id + '-label';
    label.textContent = names[index];
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'browse-select-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    const value = document.createElement('span');
    value.id = select.id + '-value';
    trigger.setAttribute('aria-labelledby', `${label.id} ${value.id}`);
    const chevron = document.createElement('span');
    chevron.className = 'browse-select-chevron';
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(value, chevron);
    const popup = document.createElement('div');
    popup.id = select.id + '-popup';
    popup.className = 'browse-select-popup';
    popup.hidden = true;
    trigger.setAttribute('aria-controls', popup.id);
    const list = document.createElement('div');
    list.className = 'browse-select-options';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', names[index]);
    const close = () => { popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const items = [...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.textContent;
      button.addEventListener('click', () => {
        select.value = option.value;
        close();
        trigger.focus();
        syncBrowseFilters();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.append(button);
      return { option, button };
    });
    popup.append(list);
    trigger.addEventListener('click', () => {
      const opening = popup.hidden;
      closeAll();
      if (!opening) return;
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      (items.find(({ option }) => option.selected) || items[0])?.button.focus();
    });
    field.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); trigger.focus(); event.stopPropagation(); }
      if (!popup.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const visible = items.map(item => item.button).filter(button => !button.hidden);
        const current = visible.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + visible.length) % visible.length;
        visible[next]?.focus();
      }
    });
    field.addEventListener('focusout', event => { if (!field.contains(event.relatedTarget)) close(); });
    select.before(field);
    select.hidden = true;
    field.append(label, select, trigger, popup);
    controls.push({ select, trigger, value, items, close });
  });
  document.addEventListener('click', event => { if (!event.target.closest('.browse-filter-field')) closeAll(); });
  const input = document.getElementById('browse-search-input');
  const searchWrap = input.parentElement;
  const field = document.createElement('div');
  field.className = 'browse-search-field';
  const label = document.createElement('label');
  label.htmlFor = input.id;
  label.className = 'browse-filter-label';
  label.textContent = 'Tìm kiếm anime';
  searchWrap.before(field);
  field.append(label, searchWrap);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-filter-toggle';
  toggle.textContent = 'Bộ lọc & Sắp xếp';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', controls.map(control => control.select.parentElement.id = control.select.id + '-field').join(' '));
  field.after(toggle);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    document.getElementById('browse-filter-form').classList.toggle('filters-expanded', expanded);
    if (!expanded) closeAll();
  });
  syncBrowseFilters();
}
