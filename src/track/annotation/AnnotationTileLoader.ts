import IDataSource from "../../data-source/IDataSource";
import { Tile, TileLoader } from "../TileLoader";
import { GeneInfo, GenomeFeature, GenomeFeatureType, Strand, TranscriptComponentClass, TranscriptComponentInfo, TranscriptInfo } from "./AnnotationTypes";
import TrackModel from "../TrackModel";

// Tile payload is a list of genes extended with nesting
export type Gene = GeneInfo & {
    transcripts: Array<Transcript>;
};

export type Transcript = TranscriptInfo & {
    exon: Array<TranscriptComponentInfo>,
    cds: Array<TranscriptComponentInfo>,
    utr: Array<TranscriptComponentInfo>,
    other: Array<TranscriptComponentInfo>
}

type TilePayload = Array<Gene>;

function transformAnnotations(flatFeatures: Array<GenomeFeature>) {
    // convert flat list of features into a nested structure which is easier to work with for rendering
    let payload: TilePayload = new Array();
    let activeGene: TilePayload[0];
    let activeTranscript: TilePayload[0]['transcripts'][0];
    let lastType: number = -1;

    for (let i = 0; i < flatFeatures.length; i++) {
        let feature = flatFeatures[i];

        // validate feature type conforms to expected nesting order
        let deltaType = feature.type - lastType;
        if (deltaType > 1) {
            console.warn(`Invalid gene feature nesting: ${GenomeFeatureType[lastType]} -> ${GenomeFeatureType[feature.type]}`);
        }
        lastType = feature.type;

        if (feature.type === GenomeFeatureType.Gene) {
            let geneInfo = feature as GeneInfo;
            activeGene = {
                ...geneInfo,
                transcripts: [],
            };
            payload.push(activeGene);
        }

        if (feature.type === GenomeFeatureType.Transcript) {
            let transcriptInfo = feature as TranscriptInfo;
            if (activeGene == null) {
                console.warn(`Out of order Transcript – no parent gene found`);
                continue;
            }
            activeTranscript = {
                ...transcriptInfo,
                exon: [],
                cds: [],
                utr: [],
                other: [],
            };
            activeGene.transcripts.push(activeTranscript);
        }

        if (feature.type === GenomeFeatureType.TranscriptComponent) {
            let componentInfo = feature as TranscriptComponentInfo;
            if (activeTranscript == null) {
                console.warn(`Out of order TranscriptComponent – no parent transcript found`);
                continue;
            }

            // bucket components by class
            switch (componentInfo.class) {
                case TranscriptComponentClass.Exon: {
                    activeTranscript.exon.push(componentInfo);
                    break;
                }
                case TranscriptComponentClass.ProteinCodingSequence: {
                    // validate CDS ordering (must be startIndex ascending)
                    let lastCDS = activeTranscript.cds[activeTranscript.cds.length - 1];
                    if (lastCDS != null && (lastCDS.startIndex >= componentInfo.startIndex)) {
                        console.warn(`Out of order CDS – Protein coding components must be sorted by startIndex`);
                    }

                    activeTranscript.cds.push(componentInfo);
                    break;
                }
                case TranscriptComponentClass.Untranslated: {
                    activeTranscript.utr.push(componentInfo);
                    break;
                }
                default: {
                    activeTranscript.other.push(componentInfo);
                    break;
                }
            }
        }
    }

    return payload;
}

enum AnnotationFormat {
    ValisGenes,
    BigBed,
}

export class AnnotationTileLoader extends TileLoader<TilePayload, void> {

    protected annotationFileFormat?: AnnotationFormat = null;

    readonly macroLod = 5;

    protected readonly macroLodBlendRange = 2;
    protected readonly macroLodThresholdLow = 7;
    protected readonly macroLodThresholdHigh = this.macroLodThresholdLow + this.macroLodBlendRange;

    static cacheKey(model: TrackModel): string {
        return model.path;
    }

    constructor(
        protected readonly dataSource: IDataSource,
        protected readonly model: TrackModel,
        protected readonly contig: string,
        tileSize: number = 1 << 20
    ) {
        super(tileSize, 1);

        // determine annotation file format
        if (model.path != null) {
            let fileType = model.path.substr(model.path.lastIndexOf('.') + 1).toLowerCase();

            switch (fileType) {
                case 'vgenes-dir':
                    this.annotationFileFormat = AnnotationFormat.ValisGenes;
                    break;
                case 'bigbed':
                case 'bbed':
                case 'bb':
                    this.annotationFileFormat = AnnotationFormat.BigBed;
                    break;
            }
        }
    }

    mapLodLevel(l: number) {
        if (l < this.macroLod) {
            return 0;
        } else {
            return this.macroLod;
        }
    }

    protected getTilePayload(tile: Tile<TilePayload>): Promise<TilePayload> | TilePayload {
        let isMacro = tile.lodLevel >= this.macroLod;
        if (this.model.path != null) {
            switch (this.annotationFileFormat) {
                case AnnotationFormat.ValisGenes: {
                    // using path override
                    return AnnotationTileLoader.loadValisGenesAnnotations(this.model.path, this.contig, tile.x, tile.span, isMacro).then(transformAnnotations);
                }
                case AnnotationFormat.BigBed: {
                    return [];
                }
            }
        } else {
            return this.dataSource.loadAnnotations(this.contig, tile.x, tile.span, isMacro).then(transformAnnotations);
        }
    }

    static loadValisGenesAnnotations(
        path: string,
        contig: string,
        startBaseIndex: number,
        span: number,
        macro: boolean,
    ): Promise<TilePayload> {
        let jsonPath = `${path}/${contig}${macro ? '-macro' : ''}/${startBaseIndex},${span}.json`;
        return new Promise<TilePayload>((resolve, reject) => {
            let request = new XMLHttpRequest();
            // disable caching (because of common browser bugs)
            request.open('GET', jsonPath, true);
            request.responseType = 'json';
            request.onloadend = () => {
                if (request.status >= 200 && request.status < 300) {
                    // success-like response
                    resolve(request.response);
                } else {
                    // error-like response
                    reject(`HTTP request error: ${request.statusText} (${request.status})`);
                }
            }
            request.send();
        });
    }

}

export default AnnotationTileLoader;