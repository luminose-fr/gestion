/**
 * @vitest-environment jsdom
 *
 * Le studio prévient l'application quand le montage change (SPEC §13.1) : le
 * 28/10/2026, une vidéo exportée ne passait à « Exportée », Publication ouverte,
 * qu'au rechargement de la page.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/apiService', () => ({
    fetchMontage: vi.fn(async () => ({ prises: [], visuels: [], stockage: { octets: 0, plafond: 0, disponible: false } })),
}));

import * as Api from '../services/apiService';
import { useMontage } from '../components/Video/useMontage';

describe('useMontage', () => {
    it('prévient après un changement relu, pas à la première lecture', async () => {
        const onChange = vi.fn();
        const { result } = renderHook(() => useMontage('c1', onChange));
        await waitFor(() => expect(result.current.etat).not.toBeNull());
        expect(onChange).not.toHaveBeenCalled();

        await act(() => result.current.recharger());
        expect(onChange).toHaveBeenCalledTimes(1);
        // Relu AVANT de prévenir : l'application lit un montage à jour.
        expect(Api.fetchMontage).toHaveBeenCalledTimes(2);
    });
});
