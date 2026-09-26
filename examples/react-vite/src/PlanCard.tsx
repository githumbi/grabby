interface Props {
  name: string;
  price: number;
  features: string[];
}

export function PlanCard({ name, price, features }: Props) {
  return (
    <article className="card">
      <h2>{name}</h2>
      <p className="price">${price}<span>/mo</span></p>
      <ul>
        {features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <button className="btn">Choose {name}</button>
    </article>
  );
}
