/**
 * MateriaRedirect — legacy route.
 * The "matéria" (deck-pai) concept was removed: hierarchy is now Sala > Pasta > Deck.
 * Any old /materia/:id link now opens the deck itself.
 */

import { Navigate, useParams } from 'react-router-dom';

const MateriaRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/decks/${id}` : '/dashboard'} replace />;
};

export default MateriaRedirect;
