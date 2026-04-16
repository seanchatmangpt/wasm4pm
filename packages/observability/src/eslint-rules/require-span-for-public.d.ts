export namespace meta {
    let type: string;
    namespace docs {
        let description: string;
        let category: string;
        let recommended: boolean;
        let url: string;
    }
    let fixable: string;
    namespace messages {
        let noSpan: string;
        let missingInstrumentation: string;
    }
}
export function create(context: any): {
    ExportNamedDeclaration(node: any): void;
};
//# sourceMappingURL=require-span-for-public.d.ts.map