import { PageHeader } from "../../components/ui";
import { EvolucaoProducao } from "./EvolucaoProducao";
import { ComparacaoIndividual } from "./ComparacaoIndividual";
import { BusinessIntelligence } from "./BusinessIntelligence";

export default function AnalisePage() {
  return (
    <div>
      <PageHeader
        title="Análise"
        subtitle="Leitura factual dos registros — ausência de medição nunca vira zero."
      />
      <div className="space-y-8">
        <BusinessIntelligence />
        <EvolucaoProducao />
        <ComparacaoIndividual />
      </div>
    </div>
  );
}
