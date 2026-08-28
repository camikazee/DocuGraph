import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Settings"
        onSubmit={() => undefined}
      >
        <input aria-label="Workspace name" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('labels the dialog, contains focus, and restores it after Escape', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
